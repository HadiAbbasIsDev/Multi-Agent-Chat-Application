const express = require('express');
const { body } = require('express-validator');
const { query, getClient } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { uuidParamValidation } = require('../middleware/validation');

const router = express.Router();
router.use(authenticateToken);

// Create or get direct thread with another user
router.post('/direct', [
  body('userId').isUUID().withMessage('Invalid user ID'),
], async (req, res) => {
  const client = await getClient();
  
  try {
    const { userId } = req.body;
    const currentUserId = req.user.id;

    if (currentUserId === userId) {
      return res.status(400).json({ error: 'Cannot create direct thread with yourself' });
    }

    await client.query('BEGIN');

    // Check if other user exists and is not blocked
    const userCheck = await client.query(
      'SELECT id, is_blocked FROM users WHERE id = $1',
      [userId]
    );

    if (userCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'User not found' });
    }

    if (userCheck.rows[0].is_blocked) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Cannot create thread with blocked user' });
    }

    // Check if users are connected (contact request accepted)
    const contactCheck = await client.query(
      `SELECT 1 FROM contact_requests
       WHERE ((from_user_id = $1 AND to_user_id = $2) OR (from_user_id = $2 AND to_user_id = $1))
       AND status = 'ACCEPTED'`,
      [currentUserId, userId]
    );

    if (contactCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Must be connected with user to create direct thread' });
    }

    // Order user IDs for consistent lookup
    const [userAId, userBId] = [currentUserId, userId].sort();

    // Check if direct thread already exists
    const existingThread = await client.query(
      `SELECT dt.thread_id, ct.created_at, ct.last_message_at
       FROM direct_threads dt
       INNER JOIN chat_threads ct ON dt.thread_id = ct.id
       WHERE dt.user_a_id = $1 AND dt.user_b_id = $2`,
      [userAId, userBId]
    );

    if (existingThread.rows.length > 0) {
      await client.query('COMMIT');
      const thread = existingThread.rows[0];
      return res.json({
        message: 'Direct thread already exists',
        thread: {
          id: thread.thread_id,
          type: 'DIRECT',
          otherUserId: userId,
          createdAt: thread.created_at,
          lastMessageAt: thread.last_message_at
        }
      });
    }

    // Create new chat thread
    const threadResult = await client.query(
      `INSERT INTO chat_threads (type) VALUES ('DIRECT')
       RETURNING id, type, created_at, last_message_at`
    );

    const thread = threadResult.rows[0];

    // Create direct thread entry
    await client.query(
      `INSERT INTO direct_threads (thread_id, user_a_id, user_b_id)
       VALUES ($1, $2, $3)`,
      [thread.id, userAId, userBId]
    );

    await client.query('COMMIT');

    res.status(201).json({
      message: 'Direct thread created',
      thread: {
        id: thread.id,
        type: thread.type,
        otherUserId: userId,
        createdAt: thread.created_at,
        lastMessageAt: thread.last_message_at
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Create direct thread error:', error);
    res.status(500).json({ error: 'Failed to create direct thread' });
  } finally {
    client.release();
  }
});

// Get all threads for current user
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;

    // Get direct threads
    const directThreads = await query(
      `SELECT ct.id, ct.type, ct.created_at, ct.last_message_at,
              CASE 
                WHEN dt.user_a_id = $1 THEN dt.user_b_id
                ELSE dt.user_a_id
              END as other_user_id,
              u.display_name, u.avatar_url, u.last_active_at,
              m.body as last_message_body, m.created_at as last_message_time,
              ms.display_name as last_message_sender
       FROM chat_threads ct
       INNER JOIN direct_threads dt ON ct.id = dt.thread_id
       INNER JOIN users u ON (
         CASE 
           WHEN dt.user_a_id = $1 THEN dt.user_b_id
           ELSE dt.user_a_id
         END = u.id
       )
       LEFT JOIN LATERAL (
         SELECT body, created_at, sender_id
         FROM messages
         WHERE thread_id = ct.id AND deleted_at IS NULL
         ORDER BY created_at DESC
         LIMIT 1
       ) m ON true
       LEFT JOIN users ms ON m.sender_id = ms.id
       WHERE dt.user_a_id = $1 OR dt.user_b_id = $1
       ORDER BY ct.last_message_at DESC`,
      [userId]
    );

    // Get group threads
    const groupThreads = await query(
      `SELECT ct.id, ct.type, ct.created_at, ct.last_message_at,
              g.name as group_name, g.picture_url, g.member_count,
              m.body as last_message_body, m.created_at as last_message_time,
              ms.display_name as last_message_sender
       FROM chat_threads ct
       INNER JOIN groups g ON ct.id = g.thread_id
       INNER JOIN group_members gm ON g.thread_id = gm.group_id
       LEFT JOIN LATERAL (
         SELECT body, created_at, sender_id
         FROM messages
         WHERE thread_id = ct.id AND deleted_at IS NULL
         ORDER BY created_at DESC
         LIMIT 1
       ) m ON true
       LEFT JOIN users ms ON m.sender_id = ms.id
       WHERE gm.user_id = $1
       ORDER BY ct.last_message_at DESC`,
      [userId]
    );

    const threads = [
      ...directThreads.rows.map(row => ({
        id: row.id,
        type: row.type,
        createdAt: row.created_at,
        lastMessageAt: row.last_message_at,
        otherUser: {
          id: row.other_user_id,
          displayName: row.display_name,
          avatarUrl: row.avatar_url,
          lastActiveAt: row.last_active_at
        },
        lastMessage: row.last_message_body ? {
          body: row.last_message_body,
          timestamp: row.last_message_time,
          senderName: row.last_message_sender
        } : null
      })),
      ...groupThreads.rows.map(row => ({
        id: row.id,
        type: row.type,
        createdAt: row.created_at,
        lastMessageAt: row.last_message_at,
        group: {
          name: row.group_name,
          pictureUrl: row.picture_url,
          memberCount: row.member_count
        },
        lastMessage: row.last_message_body ? {
          body: row.last_message_body,
          timestamp: row.last_message_time,
          senderName: row.last_message_sender
        } : null
      }))
    ].sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt));

    res.json({ threads });
  } catch (error) {
    console.error('Get threads error:', error);
    res.status(500).json({ error: 'Failed to fetch threads' });
  }
});

// Get specific thread details
router.get('/:threadId', uuidParamValidation('threadId'), async (req, res) => {
  try {
    const { threadId } = req.params;
    const userId = req.user.id;

    // Check thread type
    const threadCheck = await query(
      'SELECT id, type, created_at, last_message_at FROM chat_threads WHERE id = $1',
      [threadId]
    );

    if (threadCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Thread not found' });
    }

    const thread = threadCheck.rows[0];

    if (thread.type === 'DIRECT') {
      // Get direct thread details
      const directThread = await query(
        `SELECT dt.user_a_id, dt.user_b_id,
                u.id, u.display_name, u.avatar_url, u.last_active_at
         FROM direct_threads dt
         INNER JOIN users u ON (
           CASE 
             WHEN dt.user_a_id = $1 THEN dt.user_b_id
             ELSE dt.user_a_id
           END = u.id
         )
         WHERE dt.thread_id = $2 AND (dt.user_a_id = $1 OR dt.user_b_id = $1)`,
        [userId, threadId]
      );

      if (directThread.rows.length === 0) {
        return res.status(403).json({ error: 'Not a participant in this thread' });
      }

      const otherUser = directThread.rows[0];
      return res.json({
        id: thread.id,
        type: thread.type,
        createdAt: thread.created_at,
        lastMessageAt: thread.last_message_at,
        otherUser: {
          id: otherUser.id,
          displayName: otherUser.display_name,
          avatarUrl: otherUser.avatar_url,
          lastActiveAt: otherUser.last_active_at
        }
      });
    } else {
      // Get group details
      const group = await query(
        `SELECT g.name, g.owner_id, g.member_count, g.picture_url, g.max_members,
                gm.role
         FROM groups g
         INNER JOIN group_members gm ON g.thread_id = gm.group_id
         WHERE g.thread_id = $1 AND gm.user_id = $2`,
        [threadId, userId]
      );

      if (group.rows.length === 0) {
        return res.status(403).json({ error: 'Not a member of this group' });
      }

      const groupData = group.rows[0];
      
      // Get members
      const members = await query(
        `SELECT gm.user_id, gm.role, gm.joined_at,
                u.display_name, u.avatar_url
         FROM group_members gm
         INNER JOIN users u ON gm.user_id = u.id
         WHERE gm.group_id = $1
         ORDER BY gm.joined_at ASC`,
        [threadId]
      );

      return res.json({
        id: thread.id,
        type: thread.type,
        createdAt: thread.created_at,
        lastMessageAt: thread.last_message_at,
        group: {
          name: groupData.name,
          ownerId: groupData.owner_id,
          memberCount: groupData.member_count,
          pictureUrl: groupData.picture_url,
          maxMembers: groupData.max_members,
          yourRole: groupData.role,
          members: members.rows.map(m => ({
            userId: m.user_id,
            displayName: m.display_name,
            avatarUrl: m.avatar_url,
            role: m.role,
            joinedAt: m.joined_at
          }))
        }
      });
    }
  } catch (error) {
    console.error('Get thread details error:', error);
    res.status(500).json({ error: 'Failed to fetch thread details' });
  }
});

module.exports = router;