const express = require('express');
const { query, getClient } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { uuidParamValidation } = require('../middleware/validation');
const { body } = require('express-validator');

const router = express.Router();
router.use(authenticateToken);

// Send contact request
router.post('/', [
  body('toUserId').isUUID().withMessage('Invalid user ID'),
], async (req, res) => {
  const client = await getClient();
  
  try {
    const { toUserId } = req.body;
    const fromUserId = req.user.id;

    if (fromUserId === toUserId) {
      return res.status(400).json({ error: 'Cannot send contact request to yourself' });
    }

    await client.query('BEGIN');

    // Check if target user exists and is not blocked
    const userCheck = await client.query(
      'SELECT id, is_blocked FROM users WHERE id = $1',
      [toUserId]
    );

    if (userCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'User not found' });
    }

    if (userCheck.rows[0].is_blocked) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Cannot send request to blocked user' });
    }

    // Check for existing request (both directions)
    const existingRequest = await client.query(
      `SELECT id, status, from_user_id, to_user_id
       FROM contact_requests
       WHERE (from_user_id = $1 AND to_user_id = $2)
       OR (from_user_id = $2 AND to_user_id = $1)`,
      [fromUserId, toUserId]
    );

    if (existingRequest.rows.length > 0) {
      const existing = existingRequest.rows[0];
      
      if (existing.status === 'ACCEPTED') {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Already connected with this user' });
      }
      
      if (existing.status === 'PENDING') {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Contact request already pending' });
      }
    }

    // Create new contact request
    const result = await client.query(
      `INSERT INTO contact_requests (from_user_id, to_user_id, status)
       VALUES ($1, $2, 'PENDING')
       RETURNING id, from_user_id, to_user_id, status, created_at`,
      [fromUserId, toUserId]
    );

    await client.query('COMMIT');

    const request = result.rows[0];
    
    // Emit socket event to recipient
    const io = req.app.get('io');
    io.to(toUserId).emit('contact_request_received', {
      id: request.id,
      fromUserId: fromUserId,
      status: request.status,
      createdAt: request.created_at
    });

    res.status(201).json({
      message: 'Contact request sent',
      request: {
        id: request.id,
        fromUserId: request.from_user_id,
        toUserId: request.to_user_id,
        status: request.status,
        createdAt: request.created_at
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Send contact request error:', error);
    res.status(500).json({ error: 'Failed to send contact request' });
  } finally {
    client.release();
  }
});

// Get pending contact requests (received)
router.get('/pending', async (req, res) => {
  try {
    const result = await query(
      `SELECT cr.id, cr.from_user_id, cr.created_at,
              u.email, u.display_name, u.avatar_url
       FROM contact_requests cr
       INNER JOIN users u ON cr.from_user_id = u.id
       WHERE cr.to_user_id = $1 AND cr.status = 'PENDING'
       ORDER BY cr.created_at DESC`,
      [req.user.id]
    );

    res.json({
      requests: result.rows.map(r => ({
        id: r.id,
        fromUser: {
          id: r.from_user_id,
          email: r.email,
          displayName: r.display_name,
          avatarUrl: r.avatar_url
        },
        createdAt: r.created_at
      }))
    });
  } catch (error) {
    console.error('Get pending requests error:', error);
    res.status(500).json({ error: 'Failed to fetch pending requests' });
  }
});

// Get sent contact requests
router.get('/sent', async (req, res) => {
  try {
    const result = await query(
      `SELECT cr.id, cr.to_user_id, cr.status, cr.created_at,
              u.email, u.display_name, u.avatar_url
       FROM contact_requests cr
       INNER JOIN users u ON cr.to_user_id = u.id
       WHERE cr.from_user_id = $1 AND cr.status = 'PENDING'
       ORDER BY cr.created_at DESC`,
      [req.user.id]
    );

    res.json({
      requests: result.rows.map(r => ({
        id: r.id,
        toUser: {
          id: r.to_user_id,
          email: r.email,
          displayName: r.display_name,
          avatarUrl: r.avatar_url
        },
        status: r.status,
        createdAt: r.created_at
      }))
    });
  } catch (error) {
    console.error('Get sent requests error:', error);
    res.status(500).json({ error: 'Failed to fetch sent requests' });
  }
});

// Accept contact request
router.post('/:requestId/accept', uuidParamValidation('requestId'), async (req, res) => {
  const client = await getClient();
  
  try {
    const { requestId } = req.params;

    await client.query('BEGIN');

    // Check if request exists and is actionable by current user
    const requestCheck = await client.query(
      `SELECT id, from_user_id, to_user_id, status
       FROM contact_requests
       WHERE id = $1 AND to_user_id = $2`,
      [requestId, req.user.id]
    );

    if (requestCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Contact request not found' });
    }

    const request = requestCheck.rows[0];

    if (request.status !== 'PENDING') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Request already processed' });
    }

    // Accept the request
    const result = await client.query(
      `UPDATE contact_requests
       SET status = 'ACCEPTED', responded_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING id, from_user_id, to_user_id, status, responded_at`,
      [requestId]
    );

    await client.query('COMMIT');

    const updatedRequest = result.rows[0];
    
    // Emit socket event to requester
    const io = req.app.get('io');
    io.to(updatedRequest.from_user_id).emit('contact_request_accepted', {
      requestId: updatedRequest.id,
      acceptedBy: req.user.id
    });

    res.json({
      message: 'Contact request accepted',
      request: {
        id: updatedRequest.id,
        status: updatedRequest.status,
        respondedAt: updatedRequest.responded_at
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Accept contact request error:', error);
    res.status(500).json({ error: 'Failed to accept contact request' });
  } finally {
    client.release();
  }
});

// Reject contact request
router.post('/:requestId/reject', uuidParamValidation('requestId'), async (req, res) => {
  try {
    const { requestId } = req.params;

    const requestCheck = await query(
      `SELECT id, from_user_id, status
       FROM contact_requests
       WHERE id = $1 AND to_user_id = $2`,
      [requestId, req.user.id]
    );

    if (requestCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Contact request not found' });
    }

    if (requestCheck.rows[0].status !== 'PENDING') {
      return res.status(400).json({ error: 'Request already processed' });
    }

    const result = await query(
      `UPDATE contact_requests
       SET status = 'REJECTED', responded_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING id, status, responded_at`,
      [requestId]
    );

    const updatedRequest = result.rows[0];

    // Emit socket event
    const io = req.app.get('io');
    io.to(requestCheck.rows[0].from_user_id).emit('contact_request_rejected', {
      requestId: updatedRequest.id
    });

    res.json({
      message: 'Contact request rejected',
      request: {
        id: updatedRequest.id,
        status: updatedRequest.status,
        respondedAt: updatedRequest.responded_at
      }
    });
  } catch (error) {
    console.error('Reject contact request error:', error);
    res.status(500).json({ error: 'Failed to reject contact request' });
  }
});

// Remove contact (delete accepted contact request) - MUST be before /:requestId route
router.delete('/user/:userId', uuidParamValidation('userId'), async (req, res) => {
  const client = await getClient();
  
  try {
    const { userId } = req.params;
    const currentUserId = req.user.id;

    if (currentUserId === userId) {
      return res.status(400).json({ error: 'Cannot remove yourself' });
    }

    await client.query('BEGIN');

    // Find the accepted contact request (either direction)
    const contactRequest = await client.query(
      `SELECT id, from_user_id, to_user_id, status
       FROM contact_requests
       WHERE ((from_user_id = $1 AND to_user_id = $2)
       OR (from_user_id = $2 AND to_user_id = $1))
       AND status = 'ACCEPTED'`,
      [currentUserId, userId]
    );

    if (contactRequest.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Contact not found' });
    }

    // Delete the contact request
    await client.query(
      `DELETE FROM contact_requests
       WHERE id = $1`,
      [contactRequest.rows[0].id]
    );

    await client.query('COMMIT');

    // Emit socket event to the other user
    const io = req.app.get('io');
    io.to(userId).emit('contact_removed', {
      removedBy: currentUserId
    });

    res.json({ message: 'Contact removed successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Remove contact error:', error);
    res.status(500).json({ error: 'Failed to remove contact' });
  } finally {
    client.release();
  }
});

// Cancel sent contact request - MUST be after /user/:userId route
router.delete('/:requestId', uuidParamValidation('requestId'), async (req, res) => {
  try {
    const { requestId } = req.params;

    const result = await query(
      `DELETE FROM contact_requests
       WHERE id = $1 AND from_user_id = $2 AND status = 'PENDING'
       RETURNING id, to_user_id`,
      [requestId, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Contact request not found or cannot be cancelled' });
    }

    // Emit socket event
    const io = req.app.get('io');
    io.to(result.rows[0].to_user_id).emit('contact_request_cancelled', {
      requestId: requestId
    });

    res.json({ message: 'Contact request cancelled' });
  } catch (error) {
    console.error('Cancel contact request error:', error);
    res.status(500).json({ error: 'Failed to cancel contact request' });
  }
});

module.exports = router;