// src/services/messageQueue.js
const { query, getClient } = require('../config/database');
const config = require('../config');

class MessageQueueService {
  constructor(io) {
    this.io = io;
    this.isProcessing = false;
    this.processorInterval = null;
  }

  /**
   * Initialize the queue processor
   */
  start() {
    console.log('📬 Message Queue Service started');
    
    // Start the queue processor
    this.processorInterval = setInterval(
      () => this.processQueue(),
      config.messageDelivery.queueProcessorInterval
    );

    // Start connection quality monitor
    setInterval(
      () => this.monitorConnectionQuality(),
      config.messageDelivery.connectionCheckInterval
    );

    console.log(`✅ Queue processor running every ${config.messageDelivery.queueProcessorInterval}ms`);
  }

  /**
   * Stop the queue processor
   */
  stop() {
    if (this.processorInterval) {
      clearInterval(this.processorInterval);
      this.processorInterval = null;
      console.log('📬 Message Queue Service stopped');
    }
  }

  /**
   * Add a message to the delivery queue
   */
  async enqueueMessage(messageId, threadId, senderId, recipientIds) {
    const client = await getClient();
    
    try {
      await client.query('BEGIN');

      // Check if sender is online before allowing message send
      const senderStatus = await this.getUserConnectionStatus(senderId);
      if (!senderStatus || !senderStatus.is_online) {
        await client.query('ROLLBACK');
        throw new Error('OFFLINE_USER_CANNOT_SEND');
      }

      // Create queue entries for each recipient
      const queuePromises = recipientIds.map(recipientId => {
        // Check if recipient is online to determine initial delivery method
        return this.getUserConnectionStatus(recipientId).then(recipientStatus => {
          const deliveryMethod = recipientStatus && recipientStatus.is_online 
            ? 'WEBSOCKET' 
            : 'DATABASE_ONLY';
          
          const nextRetryAt = recipientStatus && recipientStatus.is_online 
            ? new Date(Date.now() + config.messageDelivery.retryIntervals[0])
            : null; // Don't retry for offline users, wait for them to come online

          return client.query(
            `INSERT INTO message_queue 
             (message_id, thread_id, sender_id, recipient_id, delivery_method, status, next_retry_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING id`,
            [messageId, threadId, senderId, recipientId, deliveryMethod, 'PENDING', nextRetryAt]
          );
        });
      });

      await Promise.all(queuePromises);
      await client.query('COMMIT');

      console.log(`📨 Enqueued message ${messageId} for ${recipientIds.length} recipients`);

      // Trigger immediate delivery attempt for online users
      setImmediate(() => this.processQueue());

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Process pending messages in the queue
   */
  async processQueue() {
    if (this.isProcessing) {
      return; // Prevent concurrent processing
    }

    this.isProcessing = true;

    try {
      // Get pending messages that are ready for retry
      const result = await query(
        `SELECT mq.id, mq.message_id, mq.thread_id, mq.sender_id, mq.recipient_id, 
                mq.delivery_method, mq.retry_count, mq.max_retries,
                m.body, m.status, m.created_at
         FROM message_queue mq
         INNER JOIN messages m ON mq.message_id = m.id
         WHERE mq.status = 'PENDING' 
           AND (mq.next_retry_at IS NULL OR mq.next_retry_at <= CURRENT_TIMESTAMP)
           AND mq.retry_count < mq.max_retries
         ORDER BY mq.created_at ASC
         LIMIT $1`,
        [config.messageDelivery.maxBatchSize]
      );

      if (result.rows.length === 0) {
        this.isProcessing = false;
        return;
      }

      console.log(`📬 Processing ${result.rows.length} pending messages`);

      // Process each message
      for (const queueItem of result.rows) {
        await this.deliverMessage(queueItem);
      }

    } catch (error) {
      console.error('❌ Queue processing error:', error.message);
      console.warn('⚠️  Message queue temporarily unavailable. Will retry...');
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Attempt to deliver a single message
   */
  async deliverMessage(queueItem) {
    const startTime = Date.now();
    let deliveryStatus = 'FAILED';
    let errorMessage = null;

    try {
      // Mark as processing
      await query(
        `UPDATE message_queue SET status = 'PROCESSING' WHERE id = $1`,
        [queueItem.id]
      );

      // Check if recipient is online
      const recipientStatus = await this.getUserConnectionStatus(queueItem.recipient_id);
      
      if (!recipientStatus || !recipientStatus.is_online) {
        // Recipient is offline - keep in queue for later
        await query(
          `UPDATE message_queue 
           SET status = 'PENDING', 
               delivery_method = 'DATABASE_ONLY',
               next_retry_at = NULL
           WHERE id = $1`,
          [queueItem.id]
        );
        
        console.log(`⏸️  Recipient ${queueItem.recipient_id} offline, message queued`);
        return;
      }

      // Try WebSocket delivery first
      const wsDelivered = await this.deliverViaWebSocket(queueItem);

      if (wsDelivered) {
        deliveryStatus = 'SUCCESS';
        
        // Mark as delivered
        await query(
          `UPDATE message_queue 
           SET status = 'DELIVERED', 
               delivered_at = CURRENT_TIMESTAMP 
           WHERE id = $1`,
          [queueItem.id]
        );

        // Update read receipt
        await query(
          `UPDATE read_receipts 
           SET delivered_at = CURRENT_TIMESTAMP 
           WHERE message_id = $1 AND user_id = $2`,
          [queueItem.message_id, queueItem.recipient_id]
        );

        console.log(`✅ Message ${queueItem.message_id} delivered to ${queueItem.recipient_id}`);

      } else if (config.messageDelivery.enableHttpFallback) {
        // Try HTTP fallback
        const httpDelivered = await this.deliverViaHttpFallback(queueItem);
        
        if (httpDelivered) {
          deliveryStatus = 'SUCCESS';
          
          await query(
            `UPDATE message_queue 
             SET status = 'DELIVERED', 
                 delivery_method = 'HTTP_FALLBACK',
                 delivered_at = CURRENT_TIMESTAMP 
             WHERE id = $1`,
            [queueItem.id]
          );

          console.log(`✅ Message ${queueItem.message_id} delivered via HTTP fallback`);
        } else {
          throw new Error('HTTP fallback failed');
        }
      } else {
        throw new Error('WebSocket delivery failed and HTTP fallback disabled');
      }

    } catch (error) {
      deliveryStatus = 'FAILED';
      errorMessage = error.message;

      console.error(`❌ Delivery failed for message ${queueItem.message_id}:`, error.message);

      // Calculate next retry time with exponential backoff
      const retryCount = queueItem.retry_count + 1;
      const retryIntervalIndex = Math.min(retryCount - 1, config.messageDelivery.retryIntervals.length - 1);
      const nextRetryDelay = config.messageDelivery.retryIntervals[retryIntervalIndex];
      const nextRetryAt = new Date(Date.now() + nextRetryDelay);

      if (retryCount >= queueItem.max_retries) {
        // Max retries reached - mark as failed
        await query(
          `UPDATE message_queue 
           SET status = 'FAILED', 
               failed_at = CURRENT_TIMESTAMP,
               last_error = $1,
               retry_count = $2
           WHERE id = $3`,
          [errorMessage, retryCount, queueItem.id]
        );

        // Update message delivery status
        await query(
          `UPDATE messages SET delivery_status = 'FAILED' WHERE id = $1`,
          [queueItem.message_id]
        );

        console.log(`💀 Message ${queueItem.message_id} permanently failed after ${retryCount} attempts`);

      } else {
        // Schedule retry
        await query(
          `UPDATE message_queue 
           SET status = 'PENDING',
               retry_count = $1,
               next_retry_at = $2,
               last_error = $3
           WHERE id = $4`,
          [retryCount, nextRetryAt, errorMessage, queueItem.id]
        );

        console.log(`🔄 Retry ${retryCount}/${queueItem.max_retries} scheduled for message ${queueItem.message_id} at ${nextRetryAt.toISOString()}`);
      }
    } finally {
      // Log delivery attempt
      const latency = Date.now() - startTime;
      
      await query(
        `INSERT INTO message_delivery_logs 
         (message_id, queue_id, recipient_id, delivery_method, attempt_number, status, error_message, latency_ms)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          queueItem.message_id,
          queueItem.id,
          queueItem.recipient_id,
          queueItem.delivery_method,
          queueItem.retry_count + 1,
          deliveryStatus,
          errorMessage,
          latency
        ]
      );
    }
  }

  /**
   * Deliver message via WebSocket
   */
  async deliverViaWebSocket(queueItem) {
    return new Promise((resolve) => {
      try {
        const socket = this.io.getUserSocket(queueItem.recipient_id);
        
        if (!socket || !socket.connected) {
          resolve(false);
          return;
        }

        // Set timeout for delivery acknowledgment
        const timeout = setTimeout(() => {
          resolve(false);
        }, config.messageDelivery.socketTimeout);

        // Emit message with acknowledgment callback
        socket.emit('new_message', {
          id: queueItem.message_id,
          threadId: queueItem.thread_id,
          senderId: queueItem.sender_id,
          body: queueItem.body,
          status: queueItem.status,
          createdAt: queueItem.created_at
        }, (ack) => {
          clearTimeout(timeout);
          resolve(ack === 'received');
        });

      } catch (error) {
        console.error('WebSocket delivery error:', error);
        resolve(false);
      }
    });
  }

  /**
   * Deliver message via HTTP fallback (polling endpoint)
   */
  async deliverViaHttpFallback(queueItem) {
    // This is a placeholder - implementation depends on your frontend polling strategy
    // The message is already in the database, so the client can fetch it via polling
    return true;
  }

  /**
   * Get user connection status
   */
  async getUserConnectionStatus(userId) {
    const result = await query(
      `SELECT user_id, socket_id, is_online, last_seen, connection_quality
       FROM user_connections
       WHERE user_id = $1`,
      [userId]
    );

    return result.rows[0] || null;
  }

  /**
   * Update user connection status
   */
  async updateUserConnection(userId, socketId, isOnline, platform = null) {
    await query(
      `INSERT INTO user_connections (user_id, socket_id, is_online, last_seen, platform)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP, $4)
       ON CONFLICT (user_id) 
       DO UPDATE SET 
         socket_id = $2,
         is_online = $3,
         last_seen = CURRENT_TIMESTAMP,
         platform = COALESCE($4, user_connections.platform)`,
      [userId, socketId, isOnline, platform]
    );

    // If user comes online, trigger delivery of queued messages
    if (isOnline) {
      console.log(`🟢 User ${userId} came online, triggering message delivery`);
      
      // Update pending messages for this user to retry immediately
      await query(
        `UPDATE message_queue 
         SET next_retry_at = CURRENT_TIMESTAMP,
             delivery_method = 'WEBSOCKET'
         WHERE recipient_id = $1 
           AND status = 'PENDING'
           AND delivery_method = 'DATABASE_ONLY'`,
        [userId]
      );

      // Trigger immediate queue processing
      setImmediate(() => this.processQueue());
    }
  }

  /**
   * Monitor connection quality
   */
  async monitorConnectionQuality() {
    try {
      // Mark users as offline if they haven't been seen recently
      await query(
        `UPDATE user_connections 
         SET is_online = false,
             connection_quality = 'DISCONNECTED'
         WHERE is_online = true 
           AND last_seen < NOW() - INTERVAL '${config.messageDelivery.offlineThreshold} milliseconds'`
      );

    } catch (error) {
      console.error('❌ Connection quality monitor error:', error.message);
      console.warn('⚠️  Connection monitor temporarily unavailable. Will retry...');
    }
  }

  /**
   * Get queue statistics
   */
  async getQueueStats() {
    const result = await query(`
      SELECT 
        COUNT(*) FILTER (WHERE status = 'PENDING') as pending,
        COUNT(*) FILTER (WHERE status = 'PROCESSING') as processing,
        COUNT(*) FILTER (WHERE status = 'DELIVERED') as delivered,
        COUNT(*) FILTER (WHERE status = 'FAILED') as failed,
        AVG(retry_count) FILTER (WHERE status = 'DELIVERED') as avg_retries
      FROM message_queue
      WHERE created_at > NOW() - INTERVAL '1 hour'
    `);

    return result.rows[0];
  }

  /**
   * Cleanup old delivery logs
   */
  async cleanupOldLogs() {
    try {
      const result = await query(
        `DELETE FROM message_delivery_logs 
         WHERE created_at < NOW() - INTERVAL '${config.messageDelivery.deliveryLogRetentionDays} days'`
      );

      console.log(`🧹 Cleaned up ${result.rowCount} old delivery logs`);
    } catch (error) {
      console.error('❌ Cleanup error:', error);
    }
  }
}

module.exports = MessageQueueService;