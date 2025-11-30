const express = require('express');
const axios = require('axios');
const { query, getClient } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { aiQueryValidation, uuidParamValidation } = require('../middleware/validation');
const config = require('../config');

const router = express.Router();
router.use(authenticateToken);

// Submit AI query
router.post('/query', aiQueryValidation, async (req, res) => {
  const client = await getClient();
  
  try {
    const { prompt } = req.body;
    const userId = req.user.id;

    await client.query('BEGIN');

    // Create AI query record
    const queryResult = await client.query(
      `INSERT INTO ai_queries (user_id, prompt)
       VALUES ($1, $2)
       RETURNING id, user_id, prompt, created_at`,
      [userId, prompt]
    );

    const aiQuery = queryResult.rows[0];

    // Call RAG service
    try {
      const ragServiceResponse = await axios.post(
        `${config.rag.serviceUrl}/query`,
        {
          query: prompt,
          user_id: userId,
          top_k: 10
        },
        {
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: 60000 // 60 second timeout (LLM can take time)
        }
      );

      const { response: answer } = ragServiceResponse.data;

      // Store AI result (citations can be null for now)
      const resultData = await client.query(
        `INSERT INTO ai_results (query_id, answer_text, citations)
         VALUES ($1, $2, $3)
         RETURNING id, query_id, answer_text, citations, created_at`,
        [aiQuery.id, answer, null]
      );

      const aiResult = resultData.rows[0];

      await client.query('COMMIT');

      res.status(201).json({
        query: {
          id: aiQuery.id,
          prompt: aiQuery.prompt,
          createdAt: aiQuery.created_at
        },
        result: {
          id: aiResult.id,
          answerText: aiResult.answer_text,
          citations: aiResult.citations,
          createdAt: aiResult.created_at
        }
      });
    } catch (ragError) {
      await client.query('ROLLBACK');
      
      console.error('RAG service error:', ragError.message);
      
      // Check if it's a timeout or connection error (service unavailable)
      if (ragError.code === 'ECONNABORTED' || ragError.code === 'ECONNREFUSED' || ragError.code === 'ETIMEDOUT') {
        return res.status(503).json({ 
          error: 'AI service is currently unavailable',
          serviceUnavailable: true
        });
      }

      // Check for RAG service specific errors
      if (ragError.response) {
        return res.status(ragError.response.status).json({
          error: ragError.response.data?.detail || ragError.response.data?.error || 'RAG service error',
          serviceUnavailable: ragError.response.status === 503
        });
      }

      return res.status(503).json({ 
        error: 'AI service is currently unavailable',
        serviceUnavailable: true
      });
    }
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('AI query error:', error);
    res.status(500).json({ error: 'Failed to submit query' });
  } finally {
    client.release();
  }
});

// Get user's query history
router.get('/queries', async (req, res) => {
  try {
    const { limit = 20, before } = req.query;
    const userId = req.user.id;

    let queryText = `
      SELECT q.id, q.prompt, q.created_at,
             r.id as result_id, r.answer_text, r.citations
      FROM ai_queries q
      LEFT JOIN ai_results r ON q.id = r.query_id
      WHERE q.user_id = $1
    `;

    const params = [userId];
    let paramCount = 2;

    if (before) {
      queryText += ` AND q.created_at < $${paramCount++}`;
      params.push(before);
    }

    queryText += ` ORDER BY q.created_at DESC LIMIT $${paramCount}`;
    params.push(parseInt(limit));

    const result = await query(queryText, params);

    const queries = result.rows.map(row => ({
      id: row.id,
      prompt: row.prompt,
      createdAt: row.created_at,
      result: row.result_id ? {
        id: row.result_id,
        answerText: row.answer_text,
        citations: row.citations
      } : null
    }));

    res.json({ queries });
  } catch (error) {
    console.error('Get query history error:', error);
    res.status(500).json({ error: 'Failed to fetch query history' });
  }
});

// Get specific query with result
router.get('/queries/:queryId', uuidParamValidation('queryId'), async (req, res) => {
  try {
    const { queryId } = req.params;

    const result = await query(
      `SELECT q.id, q.user_id, q.prompt, q.created_at,
              r.id as result_id, r.answer_text, r.citations, r.created_at as result_created_at
       FROM ai_queries q
       LEFT JOIN ai_results r ON q.id = r.query_id
       WHERE q.id = $1 AND q.user_id = $2`,
      [queryId, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Query not found' });
    }

    const row = result.rows[0];

    res.json({
      id: row.id,
      prompt: row.prompt,
      createdAt: row.created_at,
      result: row.result_id ? {
        id: row.result_id,
        answerText: row.answer_text,
        citations: row.citations,
        createdAt: row.result_created_at
      } : null
    });
  } catch (error) {
    console.error('Get query error:', error);
    res.status(500).json({ error: 'Failed to fetch query' });
  }
});

// Get message details from citation
router.get('/citations/message/:messageId', uuidParamValidation('messageId'), async (req, res) => {
  try {
    const { messageId } = req.params;

    // Get message with thread info
    const result = await query(
      `SELECT m.id, m.thread_id, m.sender_id, m.body, m.created_at,
              u.display_name as sender_name, u.avatar_url as sender_avatar,
              ct.type as thread_type,
              CASE 
                WHEN ct.type = 'DIRECT' THEN (
                  SELECT CASE 
                    WHEN dt.user_a_id = $2 THEN dt.user_b_id
                    ELSE dt.user_a_id
                  END
                  FROM direct_threads dt WHERE dt.thread_id = ct.id
                )
                ELSE NULL
              END as other_user_id,
              CASE 
                WHEN ct.type = 'GROUP' THEN g.name
                ELSE NULL
              END as group_name
       FROM messages m
       INNER JOIN users u ON m.sender_id = u.id
       INNER JOIN chat_threads ct ON m.thread_id = ct.id
       LEFT JOIN groups g ON ct.id = g.thread_id
       LEFT JOIN direct_threads dt ON ct.id = dt.thread_id
       WHERE m.id = $1 AND m.deleted_at IS NULL`,
      [messageId, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Message not found' });
    }

    const message = result.rows[0];

    // Check if user has access to this message
    const hasAccess = await query(
      `SELECT 1 FROM (
        SELECT user_a_id as user_id FROM direct_threads WHERE thread_id = $1
        UNION
        SELECT user_b_id as user_id FROM direct_threads WHERE thread_id = $1
        UNION
        SELECT user_id FROM group_members WHERE group_id = $1
      ) participants WHERE user_id = $2`,
      [message.thread_id, req.user.id]
    );

    if (hasAccess.rows.length === 0) {
      return res.status(403).json({ error: 'No access to this message' });
    }

    res.json({
      id: message.id,
      threadId: message.thread_id,
      threadType: message.thread_type,
      threadName: message.thread_type === 'GROUP' ? message.group_name : null,
      otherUserId: message.other_user_id,
      sender: {
        id: message.sender_id,
        displayName: message.sender_name,
        avatarUrl: message.sender_avatar
      },
      body: message.body,
      createdAt: message.created_at
    });
  } catch (error) {
    console.error('Get citation message error:', error);
    res.status(500).json({ error: 'Failed to fetch message' });
  }
});

// Delete query and its results
router.delete('/queries/:queryId', uuidParamValidation('queryId'), async (req, res) => {
  try {
    const { queryId } = req.params;

    const result = await query(
      'DELETE FROM ai_queries WHERE id = $1 AND user_id = $2 RETURNING id',
      [queryId, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Query not found' });
    }

    res.json({ message: 'Query deleted successfully' });
  } catch (error) {
    console.error('Delete query error:', error);
    res.status(500).json({ error: 'Failed to delete query' });
  }
});

module.exports = router;