// src/routes/messages.js
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const { query, getClient } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { uuidParamValidation, editMessageValidation } = require('../middleware/validation');
const config = require('../config');

const router = express.Router();
router.use(authenticateToken);

// Configure multer for image uploads
const backendRoot = path.resolve(__dirname, '..', '..');
const uploadDir = path.isAbsolute(config.upload.uploadDir) 
  ? config.upload.uploadDir 
  : path.resolve(backendRoot, config.upload.uploadDir.replace(/^\.\//, ''));

const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (error) {
      console.error('❌ Error creating upload directory:', error);
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: config.upload.maxFileSize
  },
  fileFilter: (req, file, cb) => {
    if (!config.upload.allowedMimeTypes.includes(file.mimetype)) {
      return cb(new Error('Only image files are allowed'));
    }
    cb(null, true);
  }
});

// Helper function to check if user is participant in thread
async function isParticipant(userId, threadId) {
  const result = await query(
    `SELECT 1 FROM (
      SELECT user_a_id as user_id FROM direct_threads WHERE thread_id = $1
      UNION
      SELECT user_b_id as user_id FROM direct_threads WHERE thread_id = $1
      UNION
      SELECT user_id FROM group_members WHERE group_id = $1
    ) participants WHERE user_id = $2`,
    [threadId, userId]
  );
  return result.rows.length > 0;
}

// Helper function to get all thread participants except sender
async function getThreadParticipants(threadId, excludeUserId) {
  const result = await query(
    `SELECT user_id FROM (
      SELECT user_a_id as user_id FROM direct_threads WHERE thread_id = $1
      UNION
      SELECT user_b_id as user_id FROM direct_threads WHERE thread_id = $1
      UNION
      SELECT user_id FROM group_members WHERE group_id = $1
    ) participants WHERE user_id != $2`,
    [threadId, excludeUserId]
  );
  return result.rows.map(row => row.user_id);
}

// Send message with fault-tolerant delivery
router.post('/:threadId', uuidParamValidation('threadId'), upload.single('image'), async (req, res) => {
  const client = await getClient();
  
  try {
    const { threadId } = req.params;
    const { body: messageBody } = req.body;
    const senderId = req.user.id;

    // Validate message has content
    if (!messageBody && !req.file) {
      return res.status(400).json({ error: 'Message must contain text or image' });
    }

    await client.query('BEGIN');

    // CRITICAL: Check if sender is online before allowing message send
    const senderStatus = await client.query(
      'SELECT is_online FROM user_connections WHERE user_id = $1',
      [senderId]
    );

    if (!senderStatus.rows.length || !senderStatus.rows[0].is_online) {
      await client.query('ROLLBACK');
      return res.status(403).json({ 
        error: 'Cannot send messages while offline',
        code: 'OFFLINE_USER_CANNOT_SEND'
      });
    }

    // Check if thread exists
    const threadCheck = await client.query(
      'SELECT id, type FROM chat_threads WHERE id = $1',
      [threadId]
    );

    if (threadCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Thread not found' });
    }

    // Check if user is participant
    const isUserParticipant = await isParticipant(senderId, threadId);
    if (!isUserParticipant) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Not a participant in this thread' });
    }

    // Insert message
    const messageResult = await client.query(
      `INSERT INTO messages (thread_id, sender_id, body, status, delivery_status)
       VALUES ($1, $2, $3, 'SENT', 'PENDING')
       RETURNING id, thread_id, sender_id, body, status, delivery_status, created_at`,
      [threadId, senderId, messageBody || null]
    );

    const message = messageResult.rows[0];

    // Handle image attachment if present
    let attachment = null;
    if (req.file) {
      const storageUrl = `/uploads/${req.file.filename}`;
      
      const attachmentResult = await client.query(
        `INSERT INTO attachments (message_id, type, mime_type, size_bytes, storage_url)
         VALUES ($1, 'IMAGE', $2, $3, $4)
         RETURNING id, type, mime_type, size_bytes, storage_url`,
        [message.id, req.file.mimetype, req.file.size, storageUrl]
      );
      
      attachment = attachmentResult.rows[0];
    }

    // Update thread's last_message_at
    await client.query(
      'UPDATE chat_threads SET last_message_at = CURRENT_TIMESTAMP WHERE id = $1',
      [threadId]
    );

    // Get all participants for delivery
    const recipientIds = await getThreadParticipants(threadId, senderId);

    // Create read receipts for all participants
    const threadType = threadCheck.rows[0].type;
    for (const recipientId of recipientIds) {
      // Check if recipient is online
      const recipientStatus = await client.query(
        'SELECT is_online FROM user_connections WHERE user_id = $1',
        [recipientId]
      );

      const isRecipientOnline = recipientStatus.rows.length > 0 && recipientStatus.rows[0].is_online;

      if (threadType === 'DIRECT' && isRecipientOnline) {
        // In direct chats with online recipient, mark as delivered
        await client.query(
          'INSERT INTO read_receipts (message_id, user_id, delivered_at) VALUES ($1, $2, CURRENT_TIMESTAMP)',
          [message.id, recipientId]
        );
      } else {
        // Create receipt (will be marked delivered when user comes online)
        await client.query(
          'INSERT INTO read_receipts (message_id, user_id) VALUES ($1, $2)',
          [message.id, recipientId]
        );
      }
    }

    await client.query('COMMIT');

    // Enqueue message for fault-tolerant delivery
    const messageQueueService = req.app.get('messageQueueService');
    if (messageQueueService) {
      try {
        await messageQueueService.enqueueMessage(
          message.id,
          message.thread_id,
          message.sender_id,
          recipientIds
        );
      } catch (queueError) {
        // If sender is offline, the enqueueMessage will throw OFFLINE_USER_CANNOT_SEND
        // This should not happen as we already checked, but handle it anyway
        console.error('Queue enqueue error:', queueError);
        if (queueError.message === 'OFFLINE_USER_CANNOT_SEND') {
          return res.status(403).json({ 
            error: 'Cannot send messages while offline',
            code: 'OFFLINE_USER_CANNOT_SEND'
          });
        }
      }
    }

    // Index message to Qdrant (async)
    if (messageBody && messageBody.trim()) {
      axios.post(`${config.rag.serviceUrl}/index-message`, {
        message_id: message.id,
        thread_id: message.thread_id,
        sender_id: message.sender_id,
        body: messageBody,
        created_at: message.created_at.toISOString()
      }).catch(err => {
        console.error('Failed to index message to RAG service:', err.message);
      });
    }

    // Also emit via WebSocket for immediate delivery to online users
    const io = req.app.get('io');
    io.to(threadId).emit('new_message', {
      id: message.id,
      threadId: message.thread_id,
      senderId: message.sender_id,
      body: message.body,
      status: message.status,
      createdAt: message.created_at,
      attachment: attachment ? {
        id: attachment.id,
        type: attachment.type,
        mimeType: attachment.mime_type,
        sizeBytes: attachment.size_bytes,
        storageUrl: attachment.storage_url
      } : null
    });

    res.status(201).json({
      message: 'Message sent',
      data: {
        id: message.id,
        threadId: message.thread_id,
        senderId: message.sender_id,
        body: message.body,
        status: message.status,
        deliveryStatus: message.delivery_status,
        createdAt: message.created_at,
        attachment: attachment ? {
          id: attachment.id,
          type: attachment.type,
          mimeType: attachment.mime_type,
          sizeBytes: attachment.size_bytes,
          storageUrl: attachment.storage_url
        } : null
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Send message error:', error);
    
    // Handle specific offline error
    if (error.message === 'OFFLINE_USER_CANNOT_SEND') {
      return res.status(403).json({ 
        error: 'Cannot send messages while offline',
        code: 'OFFLINE_USER_CANNOT_SEND'
      });
    }
    
    res.status(500).json({ error: 'Failed to send message' });
  } finally {
    client.release();
  }
});

// Get messages in a thread (with delivery status)
router.get('/:threadId', uuidParamValidation('threadId'), async (req, res) => {
  try {
    const { threadId } = req.params;
    const { limit = 50, before } = req.query;

    // Check if user is participant
    const isUserParticipant = await isParticipant(req.user.id, threadId);
    if (!isUserParticipant) {
      return res.status(403).json({ error: 'Not a participant in this thread' });
    }

    let queryText = `
      SELECT m.id, m.thread_id, m.sender_id, m.body, m.status, m.delivery_status,
             m.created_at, m.edited_at,
             u.display_name as sender_name, u.avatar_url as sender_avatar,
             a.id as attachment_id, a.type as attachment_type, a.mime_type, 
             a.size_bytes, a.storage_url, a.width, a.height,
             rr.delivered_at, rr.read_at
      FROM messages m
      INNER JOIN users u ON m.sender_id = u.id
      LEFT JOIN attachments a ON m.id = a.message_id
      LEFT JOIN read_receipts rr ON m.id = rr.message_id AND rr.user_id = $1
      WHERE m.thread_id = $2 AND m.deleted_at IS NULL
    `;

    const params = [req.user.id, threadId];
    let paramCount = 3;

    if (before) {
      queryText += ` AND m.created_at < $${paramCount++}`;
      params.push(before);
    }

    queryText += ` ORDER BY m.created_at DESC LIMIT $${paramCount}`;
    params.push(parseInt(limit));

    const result = await query(queryText, params);

    const messages = result.rows.map(row => ({
      id: row.id,
      threadId: row.thread_id,
      senderId: row.sender_id,
      senderName: row.sender_name,
      senderAvatar: row.sender_avatar,
      body: row.body,
      status: row.status,
      deliveryStatus: row.delivery_status,
      createdAt: row.created_at,
      editedAt: row.edited_at,
      isRead: !!row.read_at,
      isDelivered: !!row.delivered_at,
      attachment: row.attachment_id ? {
        id: row.attachment_id,
        type: row.attachment_type,
        mimeType: row.mime_type,
        sizeBytes: row.size_bytes,
        storageUrl: row.storage_url,
        width: row.width,
        height: row.height
      } : null
    }));

    res.json({ messages: messages.reverse() });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// Get pending messages for current user (for HTTP fallback/polling)
router.get('/pending/me', async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await query(
      `SELECT m.id, m.thread_id, m.sender_id, m.body, m.status, m.created_at,
              u.display_name as sender_name, u.avatar_url as sender_avatar,
              a.id as attachment_id, a.type as attachment_type, 
              a.mime_type, a.size_bytes, a.storage_url
       FROM message_queue mq
       INNER JOIN messages m ON mq.message_id = m.id
       INNER JOIN users u ON m.sender_id = u.id
       LEFT JOIN attachments a ON m.id = a.message_id
       WHERE mq.recipient_id = $1 
         AND mq.status IN ('PENDING', 'PROCESSING')
         AND m.deleted_at IS NULL
       ORDER BY m.created_at ASC
       LIMIT 100`,
      [userId]
    );

    const messages = result.rows.map(row => ({
      id: row.id,
      threadId: row.thread_id,
      senderId: row.sender_id,
      senderName: row.sender_name,
      senderAvatar: row.sender_avatar,
      body: row.body,
      status: row.status,
      createdAt: row.created_at,
      attachment: row.attachment_id ? {
        id: row.attachment_id,
        type: row.attachment_type,
        mimeType: row.mime_type,
        sizeBytes: row.size_bytes,
        storageUrl: row.storage_url
      } : null
    }));

    res.json({ messages });
  } catch (error) {
    console.error('Get pending messages error:', error);
    res.status(500).json({ error: 'Failed to fetch pending messages' });
  }
});

// Edit message
router.patch('/:messageId', [...uuidParamValidation('messageId'), ...editMessageValidation], async (req, res) => {
  try {
    const { messageId } = req.params;
    const { body: newBody } = req.body;

    const messageCheck = await query(
      'SELECT id, sender_id, thread_id FROM messages WHERE id = $1 AND deleted_at IS NULL',
      [messageId]
    );

    if (messageCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Message not found' });
    }

    if (messageCheck.rows[0].sender_id !== req.user.id) {
      return res.status(403).json({ error: 'Can only edit your own messages' });
    }

    const result = await query(
      `UPDATE messages
       SET body = $1, edited_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING id, thread_id, sender_id, body, status, created_at, edited_at`,
      [newBody, messageId]
    );

    const message = result.rows[0];

    const io = req.app.get('io');
    io.to(message.thread_id).emit('message_edited', {
      id: message.id,
      threadId: message.thread_id,
      body: message.body,
      editedAt: message.edited_at
    });

    res.json({
      message: 'Message edited',
      data: {
        id: message.id,
        body: message.body,
        editedAt: message.edited_at
      }
    });
  } catch (error) {
    console.error('Edit message error:', error);
    res.status(500).json({ error: 'Failed to edit message' });
  }
});

// Unsend message
router.post('/:messageId/unsend', uuidParamValidation('messageId'), async (req, res) => {
  try {
    const { messageId } = req.params;

    const messageCheck = await query(
      'SELECT id, sender_id, thread_id, body, created_at FROM messages WHERE id = $1 AND deleted_at IS NULL',
      [messageId]
    );

    if (messageCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Message not found' });
    }

    const message = messageCheck.rows[0];

    if (message.sender_id !== req.user.id) {
      return res.status(403).json({ error: 'Can only unsend your own messages' });
    }

    // Soft delete
    await query(
      'UPDATE messages SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1',
      [messageId]
    );

    // Cancel any pending deliveries
    await query(
      `UPDATE message_queue SET status = 'CANCELLED' 
       WHERE message_id = $1 AND status = 'PENDING'`,
      [messageId]
    );

    // Delete from Qdrant
    if (config.rag && config.rag.serviceUrl && message.body) {
      try {
        await axios.delete(`${config.rag.serviceUrl}/delete-message/${messageId}`, {
          timeout: 5000
        });
      } catch (err) {
        console.warn('Qdrant deletion error:', err.message);
      }
    }

    const io = req.app.get('io');
    io.to(message.thread_id).emit('message_deleted', {
      id: messageId,
      threadId: message.thread_id
    });

    res.json({ message: 'Message unsent' });
  } catch (error) {
    console.error('Unsend message error:', error);
    res.status(500).json({ error: 'Failed to unsend message' });
  }
});

// Mark message as delivered
router.post('/:messageId/delivered', uuidParamValidation('messageId'), async (req, res) => {
  try {
    const { messageId } = req.params;

    await query(
      `UPDATE read_receipts
       SET delivered_at = CURRENT_TIMESTAMP
       WHERE message_id = $1 AND user_id = $2 AND delivered_at IS NULL`,
      [messageId, req.user.id]
    );

    const io = req.app.get('io');
    const messageResult = await query('SELECT sender_id FROM messages WHERE id = $1', [messageId]);
    if (messageResult.rows.length > 0) {
      io.to(messageResult.rows[0].sender_id).emit('message_delivered', {
        messageId,
        userId: req.user.id
      });
    }

    res.json({ message: 'Message marked as delivered' });
  } catch (error) {
    console.error('Mark delivered error:', error);
    res.status(500).json({ error: 'Failed to mark message as delivered' });
  }
});

// Mark message as read
router.post('/:messageId/read', uuidParamValidation('messageId'), async (req, res) => {
  try {
    const { messageId } = req.params;

    const updateResult = await query(
      `UPDATE read_receipts
       SET read_at = CURRENT_TIMESTAMP, 
           delivered_at = COALESCE(delivered_at, CURRENT_TIMESTAMP)
       WHERE message_id = $1 AND user_id = $2 AND read_at IS NULL
       RETURNING message_id`,
      [messageId, req.user.id]
    );

    if (updateResult.rows.length === 0) {
      return res.json({ message: 'Message already read or not found' });
    }

    await query(
      `UPDATE messages SET status = 'READ' WHERE id = $1`,
      [messageId]
    );

    const io = req.app.get('io');
    const messageResult = await query('SELECT sender_id, thread_id FROM messages WHERE id = $1', [messageId]);
    if (messageResult.rows.length > 0) {
      const message = messageResult.rows[0];
      io.to(message.sender_id).emit('message_read', {
        messageId,
        userId: req.user.id,
        threadId: message.thread_id
      });
    }

    res.json({ message: 'Message marked as read' });
  } catch (error) {
    console.error('Mark read error:', error);
    res.status(500).json({ error: 'Failed to mark message as read' });
  }
});

// Mark all messages in a thread as read
router.post('/thread/:threadId/read-all', uuidParamValidation('threadId'), async (req, res) => {
  try {
    const { threadId } = req.params;
    const userId = req.user.id;

    const isUserParticipant = await isParticipant(userId, threadId);
    if (!isUserParticipant) {
      return res.status(403).json({ error: 'Not a participant in this thread' });
    }

    const unreadMessages = await query(
      `SELECT m.id, m.sender_id
       FROM messages m
       LEFT JOIN read_receipts rr ON m.id = rr.message_id AND rr.user_id = $2
       WHERE m.thread_id = $1 
         AND m.deleted_at IS NULL 
         AND m.sender_id != $2
         AND (rr.read_at IS NULL OR rr.read_at IS NULL)`,
      [threadId, userId]
    );

    for (const msg of unreadMessages.rows) {
      await query(
        `INSERT INTO read_receipts (message_id, user_id, read_at, delivered_at)
         VALUES ($1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         ON CONFLICT (message_id, user_id) 
         DO UPDATE SET read_at = CURRENT_TIMESTAMP, 
                      delivered_at = COALESCE(read_receipts.delivered_at, CURRENT_TIMESTAMP)`,
        [msg.id, userId]
      );

      await query(
        `UPDATE messages SET status = 'READ' WHERE id = $1`,
        [msg.id]
      );

      const io = req.app.get('io');
      io.to(msg.sender_id).emit('message_read', {
        messageId: msg.id,
        userId: userId,
        threadId: threadId
      });
    }

    res.json({ 
      message: 'All messages marked as read',
      count: unreadMessages.rows.length
    });
  } catch (error) {
    console.error('Mark all read error:', error);
    res.status(500).json({ error: 'Failed to mark messages as read' });
  }
});

module.exports = router;