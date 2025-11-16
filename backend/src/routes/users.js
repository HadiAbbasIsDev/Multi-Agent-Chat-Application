const express = require('express');
const { query } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { updateProfileValidation, uuidParamValidation } = require('../middleware/validation');

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Search users by email or display name
router.get('/search', async (req, res) => {
  try {
    const { q } = req.query;
    
    if (!q || q.trim().length < 2) {
      return res.status(400).json({ error: 'Search query must be at least 2 characters' });
    }

    const searchTerm = `%${q.trim()}%`;
    
    const result = await query(
      `SELECT id, email, display_name, avatar_url, last_active_at
       FROM users
       WHERE (email ILIKE $1 OR display_name ILIKE $1)
       AND id != $2
       AND is_blocked = false
       ORDER BY last_active_at DESC
       LIMIT 20`,
      [searchTerm, req.user.id]
    );

    res.json({
      users: result.rows.map(user => ({
        id: user.id,
        email: user.email,
        displayName: user.display_name,
        avatarUrl: user.avatar_url,
        lastActiveAt: user.last_active_at
      }))
    });
  } catch (error) {
    console.error('Search users error:', error);
    res.status(500).json({ error: 'Failed to search users' });
  }
});

// Get user by ID
router.get('/:userId', uuidParamValidation('userId'), async (req, res) => {
  try {
    const { userId } = req.params;

    const result = await query(
      `SELECT id, email, display_name, avatar_url, last_active_at
       FROM users
       WHERE id = $1 AND is_blocked = false`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    res.json({
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      avatarUrl: user.avatar_url,
      lastActiveAt: user.last_active_at
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// Update current user profile
router.patch('/me', updateProfileValidation, async (req, res) => {
  try {
    const { displayName, avatarUrl } = req.body;
    
    const updates = [];
    const values = [];
    let paramCount = 1;

    if (displayName !== undefined) {
      updates.push(`display_name = $${paramCount++}`);
      values.push(displayName);
    }

    if (avatarUrl !== undefined) {
      updates.push(`avatar_url = $${paramCount++}`);
      values.push(avatarUrl);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(req.user.id);

    const result = await query(
      `UPDATE users
       SET ${updates.join(', ')}
       WHERE id = $${paramCount}
       RETURNING id, email, display_name, avatar_url, created_at, last_active_at`,
      values
    );

    const user = result.rows[0];
    res.json({
      message: 'Profile updated successfully',
      user: {
        id: user.id,
        email: user.email,
        displayName: user.display_name,
        avatarUrl: user.avatar_url,
        createdAt: user.created_at,
        lastActiveAt: user.last_active_at
      }
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Get user's contacts (accepted contact requests)
router.get('/me/contacts', async (req, res) => {
  try {
    const result = await query(
      `SELECT DISTINCT u.id, u.email, u.display_name, u.avatar_url, u.last_active_at
       FROM users u
       INNER JOIN contact_requests cr ON (
         (cr.from_user_id = $1 AND cr.to_user_id = u.id) OR
         (cr.to_user_id = $1 AND cr.from_user_id = u.id)
       )
       WHERE cr.status = 'ACCEPTED'
       AND u.is_blocked = false
       ORDER BY u.display_name ASC`,
      [req.user.id]
    );

    res.json({
      contacts: result.rows.map(user => ({
        id: user.id,
        email: user.email,
        displayName: user.display_name,
        avatarUrl: user.avatar_url,
        lastActiveAt: user.last_active_at
      }))
    });
  } catch (error) {
    console.error('Get contacts error:', error);
    res.status(500).json({ error: 'Failed to fetch contacts' });
  }
});

module.exports = router;