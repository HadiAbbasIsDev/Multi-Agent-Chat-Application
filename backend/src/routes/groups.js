const express = require('express');
const { body } = require('express-validator');
const { query, getClient } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { createGroupValidation, updateGroupValidation, uuidParamValidation } = require('../middleware/validation');
const config = require('../config');

const router = express.Router();
router.use(authenticateToken);

// Create group
router.post('/', createGroupValidation, async (req, res) => {
  const client = await getClient();
  
  try {
    const { name, memberIds, pictureUrl } = req.body;
    const ownerId = req.user.id;

    // Validate member count
    if (memberIds.length + 1 > config.constants.MAX_GROUP_MEMBERS) {
      return res.status(400).json({ 
        error: `Group cannot have more than ${config.constants.MAX_GROUP_MEMBERS} members` 
      });
    }

    // Remove duplicates and owner from member list
    const uniqueMemberIds = [...new Set(memberIds)].filter(id => id !== ownerId);

    await client.query('BEGIN');

    // Verify all members exist and are not blocked
    const membersCheck = await client.query(
      `SELECT id FROM users WHERE id = ANY($1) AND is_blocked = false`,
      [uniqueMemberIds]
    );

    if (membersCheck.rows.length !== uniqueMemberIds.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Some users not found or are blocked' });
    }

    // Create chat thread
    const threadResult = await client.query(
      `INSERT INTO chat_threads (type) VALUES ('GROUP')
       RETURNING id, type, created_at, last_message_at`
    );

    const thread = threadResult.rows[0];

    // Create group
    const memberCount = uniqueMemberIds.length + 1; // +1 for owner
    await client.query(
      `INSERT INTO groups (thread_id, name, owner_id, member_count, picture_url)
       VALUES ($1, $2, $3, $4, $5)`,
      [thread.id, name, ownerId, memberCount, pictureUrl || null]
    );

    // Add owner as admin
    await client.query(
      `INSERT INTO group_members (group_id, user_id, role)
       VALUES ($1, $2, 'ADMIN')`,
      [thread.id, ownerId]
    );

    // Add other members
    for (const memberId of uniqueMemberIds) {
      await client.query(
        `INSERT INTO group_members (group_id, user_id, role)
         VALUES ($1, $2, 'MEMBER')`,
        [thread.id, memberId]
      );
    }

    await client.query('COMMIT');

    // Emit socket event to all members
    const io = req.app.get('io');
    uniqueMemberIds.forEach(memberId => {
      io.to(memberId).emit('added_to_group', {
        groupId: thread.id,
        groupName: name,
        ownerId: ownerId
      });
    });

    res.status(201).json({
      message: 'Group created successfully',
      group: {
        id: thread.id,
        name: name,
        ownerId: ownerId,
        memberCount: memberCount,
        pictureUrl: pictureUrl || null,
        createdAt: thread.created_at
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Create group error:', error);
    res.status(500).json({ error: 'Failed to create group' });
  } finally {
    client.release();
  }
});

// Update group details
router.patch('/:groupId', [...uuidParamValidation('groupId'), ...updateGroupValidation], async (req, res) => {
  try {
    const { groupId } = req.params;
    const { name, pictureUrl, onlyAdminsChangePicture, onlyAdminsSendMessages } = req.body;

    // Check if user is admin or owner
    const adminCheck = await query(
      `SELECT gm.role, g.owner_id FROM group_members gm
       INNER JOIN groups g ON g.thread_id = gm.group_id
       WHERE gm.group_id = $1 AND gm.user_id = $2`,
      [groupId, req.user.id]
    );

    if (adminCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Not a member of this group' });
    }

    const isOwner = adminCheck.rows[0].owner_id === req.user.id;
    const isAdmin = adminCheck.rows[0].role === 'ADMIN' || isOwner;

    // Only owner can change settings
    if ((onlyAdminsChangePicture !== undefined || onlyAdminsSendMessages !== undefined) && !isOwner) {
      return res.status(403).json({ error: 'Only group owner can change settings' });
    }

    // Only admins can change name and picture
    if ((name !== undefined || pictureUrl !== undefined) && !isAdmin) {
      return res.status(403).json({ error: 'Only admins can update group details' });
    }

    const updates = [];
    const values = [];
    let paramCount = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramCount++}`);
      values.push(name);
    }

    if (pictureUrl !== undefined) {
      updates.push(`picture_url = $${paramCount++}`);
      values.push(pictureUrl);
    }

    if (onlyAdminsChangePicture !== undefined) {
      updates.push(`only_admins_change_picture = $${paramCount++}`);
      values.push(onlyAdminsChangePicture);
    }

    if (onlyAdminsSendMessages !== undefined) {
      updates.push(`only_admins_send_messages = $${paramCount++}`);
      values.push(onlyAdminsSendMessages);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(groupId);

    const result = await query(
      `UPDATE groups SET ${updates.join(', ')}
       WHERE thread_id = $${paramCount}
       RETURNING thread_id, name, picture_url, only_admins_change_picture, only_admins_send_messages`,
      values
    );

    const group = result.rows[0];

    // Emit socket event
    const io = req.app.get('io');
    io.to(groupId).emit('group_updated', {
      groupId: group.thread_id,
      name: group.name,
      pictureUrl: group.picture_url,
      onlyAdminsChangePicture: group.only_admins_change_picture,
      onlyAdminsSendMessages: group.only_admins_send_messages
    });

    res.json({
      message: 'Group updated successfully',
      group: {
        id: group.thread_id,
        name: group.name,
        pictureUrl: group.picture_url,
        onlyAdminsChangePicture: group.only_admins_change_picture,
        onlyAdminsSendMessages: group.only_admins_send_messages
      }
    });
  } catch (error) {
    console.error('Update group error:', error);
    res.status(500).json({ error: 'Failed to update group' });
  }
});

// Add member to group
router.post('/:groupId/members', [
  ...uuidParamValidation('groupId'),
  body('userId').isUUID().withMessage('Invalid user ID'),
], async (req, res) => {
  const client = await getClient();
  
  try {
    const { groupId } = req.params;
    const { userId } = req.body;

    await client.query('BEGIN');

    // Check if actor is admin
    const adminCheck = await client.query(
      `SELECT role FROM group_members WHERE group_id = $1 AND user_id = $2`,
      [groupId, req.user.id]
    );

    if (adminCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Not a member of this group' });
    }

    if (adminCheck.rows[0].role !== 'ADMIN') {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Only admins can add members' });
    }

    // Check group capacity
    const groupInfo = await client.query(
      'SELECT member_count, max_members FROM groups WHERE thread_id = $1',
      [groupId]
    );

    if (groupInfo.rows[0].member_count >= groupInfo.rows[0].max_members) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Group is at maximum capacity' });
    }

    // Check if user exists and is not blocked
    const userCheck = await client.query(
      'SELECT id, is_blocked FROM users WHERE id = $1',
      [userId]
    );

    if (userCheck.rows.length === 0 || userCheck.rows[0].is_blocked) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'User not found or is blocked' });
    }

    // Check if already a member
    const memberCheck = await client.query(
      'SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2',
      [groupId, userId]
    );

    if (memberCheck.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'User is already a member' });
    }

    // Add member
    await client.query(
      `INSERT INTO group_members (group_id, user_id, role)
       VALUES ($1, $2, 'MEMBER')`,
      [groupId, userId]
    );

    // Update member count
    await client.query(
      'UPDATE groups SET member_count = member_count + 1 WHERE thread_id = $1',
      [groupId]
    );

    // Get added user's display name
    const addedUserInfo = await client.query(
      'SELECT display_name FROM users WHERE id = $1',
      [userId]
    );
    const addedUserName = addedUserInfo.rows[0]?.display_name || 'Someone';

    // Get adder's display name
    const adderInfo = await client.query(
      'SELECT display_name FROM users WHERE id = $1',
      [req.user.id]
    );
    const adderName = adderInfo.rows[0]?.display_name || 'Admin';

    // Create a system message for adding member
    const systemMessage = await client.query(
      `INSERT INTO messages (thread_id, sender_id, body, status)
       VALUES ($1, $2, $3, 'SENT')
       RETURNING id, thread_id, sender_id, body, status, created_at`,
      [groupId, req.user.id, `${adderName} added ${addedUserName} to the group`]
    );

    // Update thread's last_message_at
    await client.query(
      'UPDATE chat_threads SET last_message_at = CURRENT_TIMESTAMP WHERE id = $1',
      [groupId]
    );

    await client.query('COMMIT');

    // Emit socket events
    const io = req.app.get('io');
    const message = systemMessage.rows[0];
    
    io.to(groupId).emit('member_added', {
      groupId: groupId,
      userId: userId,
      addedBy: req.user.id
    });
    
    // Emit the system message as a new message
    io.to(groupId).emit('new_message', {
      id: message.id,
      threadId: message.thread_id,
      senderId: message.sender_id,
      senderName: adderName,
      body: message.body,
      status: message.status,
      createdAt: message.created_at,
      isSystemMessage: true
    });
    
    io.to(userId).emit('added_to_group', {
      groupId: groupId
    });

    res.status(201).json({ message: 'Member added successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Add member error:', error);
    res.status(500).json({ error: 'Failed to add member' });
  } finally {
    client.release();
  }
});

// Remove member from group
router.delete('/:groupId/members/:userId', [
  ...uuidParamValidation('groupId'),
  ...uuidParamValidation('userId'),
], async (req, res) => {
  const client = await getClient();
  
  try {
    const { groupId, userId } = req.params;

    await client.query('BEGIN');

    // Check if actor is admin
    const adminCheck = await client.query(
      `SELECT role FROM group_members WHERE group_id = $1 AND user_id = $2`,
      [groupId, req.user.id]
    );

    if (adminCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Not a member of this group' });
    }

    if (adminCheck.rows[0].role !== 'ADMIN') {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Only admins can remove members' });
    }

    // Check if target is owner
    const ownerCheck = await client.query(
      'SELECT owner_id FROM groups WHERE thread_id = $1',
      [groupId]
    );

    if (ownerCheck.rows[0].owner_id === userId) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Cannot remove group owner' });
    }

    // Remove member
    const result = await client.query(
      'DELETE FROM group_members WHERE group_id = $1 AND user_id = $2 RETURNING user_id',
      [groupId, userId]
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Member not found' });
    }

    // Update member count
    await client.query(
      'UPDATE groups SET member_count = member_count - 1 WHERE thread_id = $1',
      [groupId]
    );

    // Get removed user's display name
    const removedUserInfo = await client.query(
      'SELECT display_name FROM users WHERE id = $1',
      [userId]
    );
    const removedUserName = removedUserInfo.rows[0]?.display_name || 'Someone';

    // Get remover's display name
    const removerInfo = await client.query(
      'SELECT display_name FROM users WHERE id = $1',
      [req.user.id]
    );
    const removerName = removerInfo.rows[0]?.display_name || 'Admin';

    // Create a system message for removal
    const systemMessage = await client.query(
      `INSERT INTO messages (thread_id, sender_id, body, status)
       VALUES ($1, $2, $3, 'SENT')
       RETURNING id, thread_id, sender_id, body, status, created_at`,
      [groupId, req.user.id, `${removerName} removed ${removedUserName} from the group`]
    );

    // Update thread's last_message_at
    await client.query(
      'UPDATE chat_threads SET last_message_at = CURRENT_TIMESTAMP WHERE id = $1',
      [groupId]
    );

    await client.query('COMMIT');

    // Emit socket events
    const io = req.app.get('io');
    const message = systemMessage.rows[0];
    
    io.to(groupId).emit('member_removed', {
      groupId: groupId,
      userId: userId,
      removedBy: req.user.id
    });
    
    // Emit the system message as a new message
    io.to(groupId).emit('new_message', {
      id: message.id,
      threadId: message.thread_id,
      senderId: message.sender_id,
      body: message.body,
      status: message.status,
      createdAt: message.created_at,
      isSystemMessage: true
    });
    
    io.to(userId).emit('removed_from_group', {
      groupId: groupId
    });

    res.json({ message: 'Member removed successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Remove member error:', error);
    res.status(500).json({ error: 'Failed to remove member' });
  } finally {
    client.release();
  }
});

// Promote member to admin
router.post('/:groupId/members/:userId/promote', [
  ...uuidParamValidation('groupId'),
  ...uuidParamValidation('userId'),
], async (req, res) => {
  try {
    const { groupId, userId } = req.params;

    // Check if actor is owner
    const ownerCheck = await query(
      'SELECT owner_id FROM groups WHERE thread_id = $1',
      [groupId]
    );

    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Group not found' });
    }

    if (ownerCheck.rows[0].owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Only owner can promote members' });
    }

    // Promote member
    const result = await query(
      `UPDATE group_members SET role = 'ADMIN'
       WHERE group_id = $1 AND user_id = $2 AND role = 'MEMBER'
       RETURNING user_id`,
      [groupId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Member not found or already admin' });
    }

    // Get promoted user's display name
    const promotedUserInfo = await query(
      'SELECT display_name FROM users WHERE id = $1',
      [userId]
    );
    const promotedUserName = promotedUserInfo.rows[0]?.display_name || 'Someone';

    // Get promoter's display name
    const promoterInfo = await query(
      'SELECT display_name FROM users WHERE id = $1',
      [req.user.id]
    );
    const promoterName = promoterInfo.rows[0]?.display_name || 'Owner';

    // Create a system message for promotion
    const systemMessage = await query(
      `INSERT INTO messages (thread_id, sender_id, body, status)
       VALUES ($1, $2, $3, 'SENT')
       RETURNING id, thread_id, sender_id, body, status, created_at`,
      [groupId, req.user.id, `${promoterName} promoted ${promotedUserName} to admin`]
    );

    // Update thread's last_message_at
    await query(
      'UPDATE chat_threads SET last_message_at = CURRENT_TIMESTAMP WHERE id = $1',
      [groupId]
    );

    // Emit socket event
    const io = req.app.get('io');
    const message = systemMessage.rows[0];
    
    io.to(groupId).emit('member_promoted', {
      groupId: groupId,
      userId: userId
    });
    
    // Emit the system message as a new message
    io.to(groupId).emit('new_message', {
      id: message.id,
      threadId: message.thread_id,
      senderId: message.sender_id,
      senderName: promoterName,
      body: message.body,
      status: message.status,
      createdAt: message.created_at,
      isSystemMessage: true
    });

    res.json({ message: 'Member promoted to admin' });
  } catch (error) {
    console.error('Promote member error:', error);
    res.status(500).json({ error: 'Failed to promote member' });
  }
});

// Demote admin to member
router.post('/:groupId/members/:userId/demote', [
  ...uuidParamValidation('groupId'),
  ...uuidParamValidation('userId'),
], async (req, res) => {
  try {
    const { groupId, userId } = req.params;

    // Check if actor is owner
    const ownerCheck = await query(
      'SELECT owner_id FROM groups WHERE thread_id = $1',
      [groupId]
    );

    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Group not found' });
    }

    if (ownerCheck.rows[0].owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Only owner can demote admins' });
    }

    if (userId === req.user.id) {
      return res.status(400).json({ error: 'Owner cannot demote themselves' });
    }

    // Demote admin
    const result = await query(
      `UPDATE group_members SET role = 'MEMBER'
       WHERE group_id = $1 AND user_id = $2 AND role = 'ADMIN'
       RETURNING user_id`,
      [groupId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Admin not found' });
    }

    // Get demoted user's display name
    const demotedUserInfo = await query(
      'SELECT display_name FROM users WHERE id = $1',
      [userId]
    );
    const demotedUserName = demotedUserInfo.rows[0]?.display_name || 'Someone';

    // Get demoter's display name
    const demoterInfo = await query(
      'SELECT display_name FROM users WHERE id = $1',
      [req.user.id]
    );
    const demoterName = demoterInfo.rows[0]?.display_name || 'Owner';

    // Create a system message for demotion
    const systemMessage = await query(
      `INSERT INTO messages (thread_id, sender_id, body, status)
       VALUES ($1, $2, $3, 'SENT')
       RETURNING id, thread_id, sender_id, body, status, created_at`,
      [groupId, req.user.id, `${demoterName} demoted ${demotedUserName} to member`]
    );

    // Update thread's last_message_at
    await query(
      'UPDATE chat_threads SET last_message_at = CURRENT_TIMESTAMP WHERE id = $1',
      [groupId]
    );

    // Emit socket event
    const io = req.app.get('io');
    const message = systemMessage.rows[0];
    
    io.to(groupId).emit('member_demoted', {
      groupId: groupId,
      userId: userId
    });
    
    // Emit the system message as a new message
    io.to(groupId).emit('new_message', {
      id: message.id,
      threadId: message.thread_id,
      senderId: message.sender_id,
      senderName: demoterName,
      body: message.body,
      status: message.status,
      createdAt: message.created_at,
      isSystemMessage: true
    });

    res.json({ message: 'Admin demoted to member' });
  } catch (error) {
    console.error('Demote member error:', error);
    res.status(500).json({ error: 'Failed to demote member' });
  }
});

// Leave group
router.post('/:groupId/leave', uuidParamValidation('groupId'), async (req, res) => {
  const client = await getClient();
  
  try {
    const { groupId } = req.params;

    await client.query('BEGIN');

    // Check if user is owner
    const groupInfo = await client.query(
      'SELECT owner_id FROM groups WHERE thread_id = $1',
      [groupId]
    );

    if (groupInfo.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Group not found' });
    }

    if (groupInfo.rows[0].owner_id === req.user.id) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Owner cannot leave group. Transfer ownership or delete group instead.' });
    }

    // Remove member
    const result = await client.query(
      'DELETE FROM group_members WHERE group_id = $1 AND user_id = $2 RETURNING user_id',
      [groupId, req.user.id]
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Not a member of this group' });
    }

    // Update member count
    await client.query(
      'UPDATE groups SET member_count = member_count - 1 WHERE thread_id = $1',
      [groupId]
    );

    // Get user's display name before removing
    const userInfo = await client.query(
      'SELECT display_name FROM users WHERE id = $1',
      [req.user.id]
    );
    const userName = userInfo.rows[0]?.display_name || 'Someone';

    // Create a system message for leaving
    const systemMessage = await client.query(
      `INSERT INTO messages (thread_id, sender_id, body, status)
       VALUES ($1, $2, $3, 'SENT')
       RETURNING id, thread_id, sender_id, body, status, created_at`,
      [groupId, req.user.id, `${userName} left the group`]
    );

    // Update thread's last_message_at
    await client.query(
      'UPDATE chat_threads SET last_message_at = CURRENT_TIMESTAMP WHERE id = $1',
      [groupId]
    );

    await client.query('COMMIT');

    // Emit socket event with system message
    const io = req.app.get('io');
    const message = systemMessage.rows[0];
    
    io.to(groupId).emit('member_left', {
      groupId: groupId,
      userId: req.user.id,
      userName: userName
    });
    
    // Also emit as a new message so it appears in chat
    // Make sure to include senderName for proper display
    io.to(groupId).emit('new_message', {
      id: message.id,
      threadId: message.thread_id,
      senderId: message.sender_id,
      senderName: userName,
      body: message.body,
      status: message.status,
      createdAt: message.created_at,
      isSystemMessage: true
    });

    res.json({ message: 'Left group successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Leave group error:', error);
    res.status(500).json({ error: 'Failed to leave group' });
  } finally {
    client.release();
  }
});

module.exports = router;