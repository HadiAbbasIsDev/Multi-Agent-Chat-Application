const jwt = require('jsonwebtoken');
const config = require('../config');
const { query } = require('../config/database');

// Store online users
const onlineUsers = new Map(); // userId -> socketId

module.exports = (io) => {
  // Middleware for socket authentication
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      
      if (!token) {
        return next(new Error('Authentication error'));
      }

      const decoded = jwt.verify(token, config.jwt.secret);
      
      // Verify user exists and is not blocked
      const result = await query(
        'SELECT id, email, display_name, is_blocked FROM users WHERE id = $1',
        [decoded.userId]
      );

      if (result.rows.length === 0 || result.rows[0].is_blocked) {
        return next(new Error('Authentication error'));
      }

      socket.userId = decoded.userId;
      socket.user = result.rows[0];
      next();
    } catch (error) {
      console.error('Socket auth error:', error);
      next(new Error('Authentication error'));
    }
  });

  io.on('connection', async (socket) => {
    console.log(`User connected: ${socket.userId}`);
    
    // Store user's socket ID
    onlineUsers.set(socket.userId, socket.id);

    // Update user's last active timestamp
    await query(
      'UPDATE users SET last_active_at = CURRENT_TIMESTAMP WHERE id = $1',
      [socket.userId]
    );

    // Join user to their own room (for direct notifications)
    socket.join(socket.userId);

    // Join user to all their thread rooms
    try {
      // Get direct threads
      const directThreads = await query(
        `SELECT thread_id FROM direct_threads 
         WHERE user_a_id = $1 OR user_b_id = $1`,
        [socket.userId]
      );

      // Get group threads
      const groupThreads = await query(
        `SELECT group_id FROM group_members WHERE user_id = $1`,
        [socket.userId]
      );

      // Join all thread rooms
      directThreads.rows.forEach(row => socket.join(row.thread_id));
      groupThreads.rows.forEach(row => socket.join(row.group_id));

      console.log(`User ${socket.userId} joined ${directThreads.rows.length + groupThreads.rows.length} thread rooms`);
    } catch (error) {
      console.error('Error joining thread rooms:', error);
    }

    // Broadcast user online status to contacts
    try {
      const contacts = await query(
        `SELECT DISTINCT 
           CASE 
             WHEN cr.from_user_id = $1 THEN cr.to_user_id
             ELSE cr.from_user_id
           END as contact_id
         FROM contact_requests cr
         WHERE (cr.from_user_id = $1 OR cr.to_user_id = $1)
         AND cr.status = 'ACCEPTED'`,
        [socket.userId]
      );

      contacts.rows.forEach(row => {
        io.to(row.contact_id).emit('user_online', {
          userId: socket.userId,
          timestamp: new Date()
        });
      });
    } catch (error) {
      console.error('Error broadcasting online status:', error);
    }

    // Handle typing indicator
    socket.on('typing_start', async (data) => {
      const { threadId } = data;
      
      try {
        // Verify user is participant
        const isParticipant = await query(
          `SELECT 1 FROM (
            SELECT user_a_id as user_id FROM direct_threads WHERE thread_id = $1
            UNION
            SELECT user_b_id as user_id FROM direct_threads WHERE thread_id = $1
            UNION
            SELECT user_id FROM group_members WHERE group_id = $1
          ) participants WHERE user_id = $2`,
          [threadId, socket.userId]
        );

        if (isParticipant.rows.length > 0) {
          socket.to(threadId).emit('user_typing', {
            threadId,
            userId: socket.userId,
            displayName: socket.user.display_name
          });
        }
      } catch (error) {
        console.error('Typing start error:', error);
      }
    });

    socket.on('typing_stop', async (data) => {
      const { threadId } = data;
      
      try {
        const isParticipant = await query(
          `SELECT 1 FROM (
            SELECT user_a_id as user_id FROM direct_threads WHERE thread_id = $1
            UNION
            SELECT user_b_id as user_id FROM direct_threads WHERE thread_id = $1
            UNION
            SELECT user_id FROM group_members WHERE group_id = $1
          ) participants WHERE user_id = $2`,
          [threadId, socket.userId]
        );

        if (isParticipant.rows.length > 0) {
          socket.to(threadId).emit('user_stopped_typing', {
            threadId,
            userId: socket.userId,
            displayName: socket.user.display_name
          });
        }
      } catch (error) {
        console.error('Typing stop error:', error);
      }
    });

    // Handle join thread (when user opens a thread)
    socket.on('join_thread', (data) => {
      const { threadId } = data;
      socket.join(threadId);
      console.log(`User ${socket.userId} joined thread ${threadId}`);
    });

    // Handle leave thread (when user closes a thread)
    socket.on('leave_thread', (data) => {
      const { threadId } = data;
      socket.leave(threadId);
      console.log(`User ${socket.userId} left thread ${threadId}`);
    });

    // Handle message read status update
    socket.on('messages_read', async (data) => {
      const { threadId, messageIds } = data;
      
      if (!Array.isArray(messageIds) || messageIds.length === 0) return;

      try {
        // Bulk update read receipts
        await query(
          `UPDATE read_receipts
           SET read_at = CURRENT_TIMESTAMP,
               delivered_at = COALESCE(delivered_at, CURRENT_TIMESTAMP)
           WHERE message_id = ANY($1) AND user_id = $2 AND read_at IS NULL`,
          [messageIds, socket.userId]
        );

        // Update message statuses
        await query(
          `UPDATE messages SET status = 'READ'
           WHERE id = ANY($1) AND thread_id = $2`,
          [messageIds, threadId]
        );

        // Notify senders
        socket.to(threadId).emit('messages_read_by', {
          threadId,
          messageIds,
          userId: socket.userId
        });
      } catch (error) {
        console.error('Messages read error:', error);
      }
    });

    // Handle video call signaling
    socket.on('call_initiate', async (data) => {
      const { threadId, callType } = data; // callType: 'audio' | 'video'
      
      try {
        // Verify it's a direct thread
        const threadCheck = await query(
          `SELECT user_a_id, user_b_id FROM direct_threads 
           WHERE thread_id = $1 AND (user_a_id = $2 OR user_b_id = $2)`,
          [threadId, socket.userId]
        );

        if (threadCheck.rows.length > 0) {
          const otherUserId = threadCheck.rows[0].user_a_id === socket.userId 
            ? threadCheck.rows[0].user_b_id 
            : threadCheck.rows[0].user_a_id;

          io.to(otherUserId).emit('incoming_call', {
            threadId,
            callType,
            callerId: socket.userId,
            callerName: socket.user.display_name,
            callerAvatar: socket.user.avatar_url
          });
        }
      } catch (error) {
        console.error('Call initiate error:', error);
      }
    });

    socket.on('call_answer', (data) => {
      const { threadId, accepted } = data;
      socket.to(threadId).emit('call_answered', {
        threadId,
        accepted,
        userId: socket.userId
      });
    });

    socket.on('call_end', (data) => {
      const { threadId } = data;
      socket.to(threadId).emit('call_ended', {
        threadId,
        userId: socket.userId
      });
    });

    // WebRTC signaling
    socket.on('webrtc_offer', (data) => {
      const { threadId, offer } = data;
      socket.to(threadId).emit('webrtc_offer', {
        threadId,
        offer,
        userId: socket.userId
      });
    });

    socket.on('webrtc_answer', (data) => {
      const { threadId, answer } = data;
      socket.to(threadId).emit('webrtc_answer', {
        threadId,
        answer,
        userId: socket.userId
      });
    });

    socket.on('webrtc_ice_candidate', (data) => {
      const { threadId, candidate } = data;
      socket.to(threadId).emit('webrtc_ice_candidate', {
        threadId,
        candidate,
        userId: socket.userId
      });
    });

    // Handle disconnect
    socket.on('disconnect', async () => {
      console.log(`User disconnected: ${socket.userId}`);
      
      // Remove from online users
      onlineUsers.delete(socket.userId);

      // Update last active timestamp
      await query(
        'UPDATE users SET last_active_at = CURRENT_TIMESTAMP WHERE id = $1',
        [socket.userId]
      );

      // Broadcast offline status to contacts
      try {
        const contacts = await query(
          `SELECT DISTINCT 
             CASE 
               WHEN cr.from_user_id = $1 THEN cr.to_user_id
               ELSE cr.from_user_id
             END as contact_id
           FROM contact_requests cr
           WHERE (cr.from_user_id = $1 OR cr.to_user_id = $1)
           AND cr.status = 'ACCEPTED'`,
          [socket.userId]
        );

        contacts.rows.forEach(row => {
          io.to(row.contact_id).emit('user_offline', {
            userId: socket.userId,
            lastActiveAt: new Date()
          });
        });
      } catch (error) {
        console.error('Error broadcasting offline status:', error);
      }
    });
  });

  // Helper function to check if user is online
  io.isUserOnline = (userId) => {
    return onlineUsers.has(userId);
  };

  // Helper function to get user's socket
  io.getUserSocket = (userId) => {
    const socketId = onlineUsers.get(userId);
    return socketId ? io.sockets.sockets.get(socketId) : null;
  };
};