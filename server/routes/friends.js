'use strict';

/**
 * friends.js — /api/friends routes
 *
 * GET    /api/friends                — list accepted friends
 * GET    /api/friends/requests       — incoming pending requests
 * GET    /api/friends/sent           — sent pending requests
 * GET    /api/friends/suggestions    — people you may know
 * GET    /api/friends/status/:userId — friendship status with a user
 * POST   /api/friends/request/:userId  — send friend request
 * POST   /api/friends/confirm/:userId  — accept a request
 * POST   /api/friends/decline/:userId  — decline a request
 * DELETE /api/friends/remove/:userId   — unfriend / cancel sent request
 */

const express = require('express');
const router = express.Router();
const { run, get, all } = require('../db');
const { verifyToken } = require('../middleware/authMiddleware');
const crypto = require('crypto');

// ---------------------------------------------------------------------------
// Helper — format a user row for responses
// ---------------------------------------------------------------------------
function formatUser(u) {
  return {
    id: u.id,
    username: u.username,
    fullName: u.full_name,
    avatar: u.avatar,
    dob: u.dob || null,
  };
}

// ---------------------------------------------------------------------------
// Helper — count mutual friends between two users
// ---------------------------------------------------------------------------
async function getMutualCount(userId1, userId2) {
  const friends1 = await all(
    `SELECT CASE WHEN requester_id=? THEN receiver_id ELSE requester_id END as fid
     FROM friendships WHERE (requester_id=? OR receiver_id=?) AND status='accepted'`,
    [userId1, userId1, userId1]
  );
  const friends2 = await all(
    `SELECT CASE WHEN requester_id=? THEN receiver_id ELSE requester_id END as fid
     FROM friendships WHERE (requester_id=? OR receiver_id=?) AND status='accepted'`,
    [userId2, userId2, userId2]
  );
  const set1 = new Set(friends1.map(f => f.fid));
  return friends2.filter(f => set1.has(f.fid)).length;
}

// ---------------------------------------------------------------------------
// GET /api/friends — accepted friends list
// ---------------------------------------------------------------------------
router.get('/', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const rows = await all(
      `SELECT u.id, u.username, u.full_name, u.avatar, u.dob
       FROM users u
       JOIN friendships f ON (f.requester_id = u.id OR f.receiver_id = u.id)
       WHERE (f.requester_id = ? OR f.receiver_id = ?)
         AND f.status = 'accepted'
         AND u.id != ?`,
      [userId, userId, userId]
    );
    res.json({ success: true, friends: rows.map(formatUser) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/friends/birthdays — friends with birthday today
// ---------------------------------------------------------------------------
router.get('/birthdays', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const today = new Date();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const mmdd = `${mm}-${dd}`;

    // Friends with accepted friendship
    const rows = await all(
      `SELECT u.id, u.username, u.full_name, u.avatar, u.dob
       FROM users u
       JOIN friendships f ON (f.requester_id = u.id OR f.receiver_id = u.id)
       WHERE (f.requester_id = ? OR f.receiver_id = ?)
         AND f.status = 'accepted'
         AND u.id != ?
         AND u.dob IS NOT NULL
         AND substr(u.dob, 6, 5) = ?`,
      [userId, userId, userId, mmdd]
    );
    res.json({ success: true, birthdays: rows.map(formatUser) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/friends/requests — incoming pending requests
// ---------------------------------------------------------------------------
router.get('/requests', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const rows = await all(
      `SELECT u.id, u.username, u.full_name, u.avatar, f.created_at
       FROM users u
       JOIN friendships f ON f.requester_id = u.id
       WHERE f.receiver_id = ? AND f.status = 'pending'`,
      [userId]
    );
    const requests = await Promise.all(
      rows.map(async u => ({
        ...formatUser(u),
        sentAt: u.created_at,
        mutualCount: await getMutualCount(userId, u.id),
      }))
    );
    res.json({ success: true, requests });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/friends/sent — sent pending requests
// ---------------------------------------------------------------------------
router.get('/sent', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const rows = await all(
      `SELECT u.id, u.username, u.full_name, u.avatar
       FROM users u
       JOIN friendships f ON f.receiver_id = u.id
       WHERE f.requester_id = ? AND f.status = 'pending'`,
      [userId]
    );
    res.json({ success: true, sent: rows.map(formatUser) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/friends/suggestions — people you may know
// ---------------------------------------------------------------------------
router.get('/suggestions', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    // Gather everyone already connected (any status)
    const existing = await all(
      `SELECT CASE WHEN requester_id=? THEN receiver_id ELSE requester_id END as other_id
       FROM friendships WHERE requester_id=? OR receiver_id=?`,
      [userId, userId, userId]
    );
    const excludeIds = [userId, ...existing.map(e => e.other_id)];
    const placeholders = excludeIds.map(() => '?').join(',');
    const users = await all(
      `SELECT id, username, full_name, avatar FROM users
       WHERE id NOT IN (${placeholders}) AND deactivated_at IS NULL
       ORDER BY RANDOM() LIMIT 20`,
      excludeIds
    );
    const suggestions = await Promise.all(
      users.map(async u => ({
        ...formatUser(u),
        mutualCount: await getMutualCount(userId, u.id),
      }))
    );
    res.json({ success: true, suggestions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/friends/status/:userId — check friendship status with a specific user
// ---------------------------------------------------------------------------
router.get('/status/:userId', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const otherId = req.params.userId;
    const f = await get(
      `SELECT status, requester_id FROM friendships
       WHERE (requester_id=? AND receiver_id=?) OR (requester_id=? AND receiver_id=?)`,
      [userId, otherId, otherId, userId]
    );
    if (!f) return res.json({ success: true, status: 'none' });
    if (f.status === 'accepted') return res.json({ success: true, status: 'friends' });
    if (f.status === 'pending' && f.requester_id === userId) return res.json({ success: true, status: 'sent' });
    if (f.status === 'pending' && f.requester_id !== userId) return res.json({ success: true, status: 'received' });
    res.json({ success: true, status: 'none' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/friends/request/:userId — send friend request
// ---------------------------------------------------------------------------
router.post('/request/:userId', verifyToken, async (req, res) => {
  try {
    const requesterId = req.user.id;
    const receiverId = req.params.userId;
    if (requesterId === receiverId) {
      return res.status(400).json({ error: 'Cannot add yourself.' });
    }
    const existing = await get(
      `SELECT id, status FROM friendships
       WHERE (requester_id=? AND receiver_id=?) OR (requester_id=? AND receiver_id=?)`,
      [requesterId, receiverId, receiverId, requesterId]
    );
    if (existing && existing.status === 'accepted') {
      return res.status(409).json({ error: 'Already friends.' });
    }
    if (existing && existing.status === 'pending') {
      return res.status(409).json({ error: 'Request already sent.' });
    }
    if (existing) {
      // Declined — re-open as new pending request
      await run(
        `UPDATE friendships SET status='pending', requester_id=?, receiver_id=? WHERE id=?`,
        [requesterId, receiverId, existing.id]
      );
    } else {
      await run(
        `INSERT INTO friendships (id, requester_id, receiver_id, status) VALUES (?,?,?,'pending')`,
        [crypto.randomUUID(), requesterId, receiverId]
      );
    }
    res.json({ success: true, message: 'Friend request sent.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/friends/confirm/:userId — accept a friend request
// ---------------------------------------------------------------------------
router.post('/confirm/:userId', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const requesterId = req.params.userId;
    const friendship = await get(
      `SELECT id FROM friendships WHERE requester_id=? AND receiver_id=? AND status='pending'`,
      [requesterId, userId]
    );
    if (!friendship) return res.status(404).json({ error: 'Request not found.' });
    await run(`UPDATE friendships SET status='accepted' WHERE id=?`, [friendship.id]);
    res.json({ success: true, message: 'Friend request accepted.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/friends/decline/:userId — decline a friend request
// ---------------------------------------------------------------------------
router.post('/decline/:userId', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const requesterId = req.params.userId;
    await run(
      `DELETE FROM friendships WHERE requester_id=? AND receiver_id=? AND status='pending'`,
      [requesterId, userId]
    );
    res.json({ success: true, message: 'Request declined.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/friends/remove/:userId — unfriend or cancel sent request
// ---------------------------------------------------------------------------
router.delete('/remove/:userId', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const otherId = req.params.userId;
    await run(
      `DELETE FROM friendships
       WHERE (requester_id=? AND receiver_id=?) OR (requester_id=? AND receiver_id=?)`,
      [userId, otherId, otherId, userId]
    );
    res.json({ success: true, message: 'Removed.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
