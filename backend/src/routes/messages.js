const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');
const { query, getClient } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { sendMessageValidation, editMessageValidation, uuidParamValidation } = require('../middleware/validation');
const config = require('../config');

const router = express.Router();
router.use(authenticateToken);

// Configure multer for image uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = config.upload.uploadDir;
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (error) {
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

// Send message
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
      `INSERT INTO messages (thread_id, sender_id, body, status)
       VALUES ($1, $2, $3, 'SENT')
       RETURNING id, thread_id, sender_id, body, status, created_at`,
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

    // Get all participants for read receipts
    const participantsResult = await client.query(
      `SELECT user_id FROM (
        SELECT user_a_id as user_id FROM direct_threads WHERE thread_id = $1
        UNION
        SELECT user_b_id as user_id FROM direct_threads WHERE thread_id = $1
        UNION
        SELECT user_id FROM group_members WHERE group_id = $1
      ) participants WHERE user_id != $2`,
      [threadId, senderId]
    );

    // Create read receipts for all participants except sender
    for (const participant of participantsResult.rows) {
      await client.query(
        'INSERT INTO read_receipts (message_id, user_id) VALUES ($1, $2)',
        [message.id, participant.user_id]
      );
    }

    await client.query('COMMIT');

    // Emit socket event to all participants
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
    res.status(500).json({ error: 'Failed to send message' });
  } finally {
    client.release();
  }
});

// Get messages in a thread
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
      SELECT m.id, m.thread_id, m.sender_id, m.body, m.status, m.created_at, m.edited_at,
             u.display_name as sender_name, u.avatar_url as sender_avatar,
             a.id as attachment_id, a.type as attachment_type, a.mime_type, 
             a.size_bytes, a.storage_url, a.width, a.height
      FROM messages m
      INNER JOIN users u ON m.sender_id = u.id
      LEFT JOIN attachments a ON m.id = a.message_id
      WHERE m.thread_id = $1 AND m.deleted_at IS NULL
    `;

    const params = [threadId];
    let paramCount = 2;

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
      createdAt: row.created_at,
      editedAt: row.edited_at,
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

// Edit message
router.patch('/:messageId', [...uuidParamValidation('messageId'), ...editMessageValidation], async (req, res) => {
  try {
    const { messageId } = req.params;
    const { body: newBody } = req.body;

    // Check if message exists and user is sender
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

    // Update message
    const result = await query(
      `UPDATE messages
       SET body = $1, edited_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING id, thread_id, sender_id, body, status, created_at, edited_at`,
      [newBody, messageId]
    );

    const message = result.rows[0];

    // Emit socket event
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

// Delete message for all (within 10 minutes)
router.delete('/:messageId', uuidParamValidation('messageId'), async (req, res) => {
  try {
    const { messageId } = req.params;

    const messageCheck = await query(
      'SELECT id, sender_id, thread_id, created_at FROM messages WHERE id = $1 AND deleted_at IS NULL',
      [messageId]
    );

    if (messageCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Message not found' });
    }

    const message = messageCheck.rows[0];

    if (message.sender_id !== req.user.id) {
      return res.status(403).json({ error: 'Can only delete your own messages' });
    }

    // Check if within 10 minutes
    const now = new Date();
    const createdAt = new Date(message.created_at);
    const timeDiff = now - createdAt;

    if (timeDiff > config.constants.DELETE_MESSAGE_TIMEOUT) {
      return res.status(400).json({ error: 'Can only delete messages within 10 minutes of sending' });
    }

    // Soft delete
    await query(
      'UPDATE messages SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1',
      [messageId]
    );

    // Emit socket event
    const io = req.app.get('io');
    io.to(message.thread_id).emit('message_deleted', {
      id: messageId,
      threadId: message.thread_id
    });

    res.json({ message: 'Message deleted' });
  } catch (error) {
    console.error('Delete message error:', error);
    res.status(500).json({ error: 'Failed to delete message' });
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

    // Emit socket event
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

    await query(
      `UPDATE read_receipts
       SET read_at = CURRENT_TIMESTAMP, 
           delivered_at = COALESCE(delivered_at, CURRENT_TIMESTAMP)
       WHERE message_id = $1 AND user_id = $2 AND read_at IS NULL`,
      [messageId, req.user.id]
    );

    // Update message status
    await query(
      `UPDATE messages SET status = 'READ' WHERE id = $1`,
      [messageId]
    );

    // Emit socket event
    const io = req.app.get('io');
    const messageResult = await query('SELECT sender_id FROM messages WHERE id = $1', [messageId]);
    if (messageResult.rows.length > 0) {
      io.to(messageResult.rows[0].sender_id).emit('message_read', {
        messageId,
        userId: req.user.id
      });
    }

    res.json({ message: 'Message marked as read' });
  } catch (error) {
    console.error('Mark read error:', error);
    res.status(500).json({ error: 'Failed to mark message as read' });
  }
});

module.exports = router;