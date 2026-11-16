'use strict';

/**
 * notifications.js — /api/notifications routes
 *
 * GET   /api/notifications          → paginated list
 * PATCH /api/notifications/:id/read → mark one read
 * PATCH /api/notifications/read-all → mark all read
 * GET   /api/notifications/count    → unread count
 */

const express = require('express');
const router = express.Router();
const { run, get, all } = require('../db');
const { verifyToken } = require('../middleware/authMiddleware');

// ---------------------------------------------------------------------------
// GET /api/notifications/count — unread badge count
// ---------------------------------------------------------------------------
router.get('/count', verifyToken, async (req, res) => {
  try {
    const row = await get(
      `SELECT COUNT(*) as c FROM notifications WHERE user_id = ? AND is_read = 0`,
      [req.user.id]
    );
    res.json({ count: row?.c || 0 });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get count.' });
  }
});

// ---------------------------------------------------------------------------
// PATCH /api/notifications/read-all — mark all as read
// ---------------------------------------------------------------------------
router.patch('/read-all', verifyToken, async (req, res) => {
  try {
    await run(`UPDATE notifications SET is_read = 1 WHERE user_id = ?`, [req.user.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to mark all read.' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/notifications — paginated list with actor info
// ---------------------------------------------------------------------------
router.get('/', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const page = Math.max(0, parseInt(req.query.page) || 0);
    const limit = Math.min(30, parseInt(req.query.limit) || 20);
    const offset = page * limit;

    const rows = await all(
      `SELECT n.*, u.username as actor_username, u.full_name as actor_name,
              u.first_name as actor_first_name, u.avatar as actor_avatar
       FROM notifications n
       LEFT JOIN users u ON n.actor_id = u.id
       WHERE n.user_id = ?
       ORDER BY n.created_at DESC
       LIMIT ? OFFSET ?`,
      [userId, limit, offset]
    );

    const notifications = rows.map(n => ({
      id: n.id,
      type: n.type,
      postId: n.post_id,
      commentId: n.comment_id,
      message: n.message,
      isRead: !!n.is_read,
      createdAt: n.created_at ? n.created_at.replace(' ', 'T') + 'Z' : null,
      actor: n.actor_id ? {
        id: n.actor_id,
        username: n.actor_username,
        fullName: n.actor_name,
        firstName: n.actor_first_name,
        avatar: n.actor_avatar,
      } : null,
    }));

    res.json({ notifications, page, limit });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load notifications.' });
  }
});

// ---------------------------------------------------------------------------
// PATCH /api/notifications/:id/read — mark one as read
// ---------------------------------------------------------------------------
router.patch('/:id/read', verifyToken, async (req, res) => {
  try {
    await run(
      `UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?`,
      [req.params.id, req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to mark read.' });
  }
});

module.exports = router;

