'use strict';

/**
 * users.js — /api/users routes
 *
 * GET    /api/users/:username       → public profile by username
 * POST   /api/users/:id/follow      → follow a user
 * DELETE /api/users/:id/follow      → unfollow a user
 * GET    /api/users/:id/followers   → list followers
 * GET    /api/users/:id/following   → list following
 * GET    /api/users/search?q=       → search users
 */

const express = require('express');
const router = express.Router();
const { run, get, all } = require('../db');
const { verifyToken } = require('../middleware/authMiddleware');
const crypto = require('crypto');

// ---------------------------------------------------------------------------
// GET /api/users/search?q= — search users by name or username
// ---------------------------------------------------------------------------
router.get('/search', verifyToken, async (req, res) => {
  try {
    const q = `%${(req.query.q || '').trim()}%`;
    const rows = await all(
      `SELECT id, username, full_name, first_name, avatar, bio
       FROM users
       WHERE (full_name LIKE ? OR username LIKE ?)
         AND deactivated_at IS NULL
       LIMIT 20`,
      [q, q]
    );
    res.json({ users: rows.map(u => ({
      id: u.id,
      username: u.username,
      fullName: u.full_name,
      firstName: u.first_name,
      avatar: u.avatar,
      bio: u.bio,
    })) });
  } catch (err) {
    res.status(500).json({ error: 'Search failed.' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/users/:username — public profile
// ---------------------------------------------------------------------------
router.get('/:username', verifyToken, async (req, res) => {
  try {
    const user = await get(
      `SELECT id, username, full_name, first_name, last_name, avatar, cover_photo,
              bio, location, website, dob, gender, is_private, created_at
       FROM users WHERE username = ? AND deactivated_at IS NULL`,
      [req.params.username]
    );
    if (!user) return res.status(404).json({ error: 'User not found.' });

    const viewerId = req.user.id;

    // Counts
    const [postsCount, followersCount, followingCount] = await Promise.all([
      get(`SELECT COUNT(*) as c FROM posts WHERE user_id = ?`, [user.id]),
      get(`SELECT COUNT(*) as c FROM follows WHERE following_id = ? AND status='active'`, [user.id]),
      get(`SELECT COUNT(*) as c FROM follows WHERE follower_id = ? AND status='active'`, [user.id]),
    ]);

    // Is viewer following this user?
    const isFollowing = viewerId !== user.id
      ? !!(await get(`SELECT id FROM follows WHERE follower_id = ? AND following_id = ? AND status='active'`, [viewerId, user.id]))
      : false;

    res.json({
      user: {
        id: user.id,
        username: user.username,
        fullName: user.full_name,
        firstName: user.first_name,
        lastName: user.last_name,
        avatar: user.avatar,
        coverPhoto: user.cover_photo,
        bio: user.bio,
        location: user.location,
        website: user.website,
        gender: user.gender,
        isPrivate: !!user.is_private,
        createdAt: user.created_at ? user.created_at.replace(' ', 'T') + 'Z' : null,
        postsCount: postsCount?.c || 0,
        followersCount: followersCount?.c || 0,
        followingCount: followingCount?.c || 0,
        isFollowing,
        isOwnProfile: viewerId === user.id,
      }
    });
  } catch (err) {
    console.error('[Users] Profile error:', err.message);
    res.status(500).json({ error: 'Failed to load profile.' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/users/:id/follow — follow a user
// ---------------------------------------------------------------------------
router.post('/:id/follow', verifyToken, async (req, res) => {
  try {
    const followerId = req.user.id;
    const followingId = req.params.id;

    if (followerId === followingId) {
      return res.status(400).json({ error: 'You cannot follow yourself.' });
    }

    const target = await get(`SELECT id FROM users WHERE id = ? AND deactivated_at IS NULL`, [followingId]);
    if (!target) return res.status(404).json({ error: 'User not found.' });

    const existing = await get(
      `SELECT id, status FROM follows WHERE follower_id = ? AND following_id = ?`,
      [followerId, followingId]
    );

    if (existing) {
      if (existing.status === 'active') {
        return res.json({ following: true, message: 'Already following.' });
      }
      await run(`UPDATE follows SET status = 'active' WHERE id = ?`, [existing.id]);
    } else {
      const fid = crypto.randomUUID();
      await run(
        `INSERT INTO follows (id, follower_id, following_id, status, created_at)
         VALUES (?, ?, ?, 'active', datetime('now'))`,
        [fid, followerId, followingId]
      );

      // Notification
      const notifId = crypto.randomUUID();
      run(
        `INSERT INTO notifications (id, user_id, actor_id, type, created_at)
         VALUES (?, ?, ?, 'follow', datetime('now'))`,
        [notifId, followingId, followerId]
      ).catch(() => {});
    }

    const count = await get(`SELECT COUNT(*) as c FROM follows WHERE following_id=? AND status='active'`, [followingId]);
    res.json({ following: true, followersCount: count?.c || 0 });
  } catch (err) {
    console.error('[Users] Follow error:', err.message);
    res.status(500).json({ error: 'Failed to follow user.' });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/users/:id/follow — unfollow a user
// ---------------------------------------------------------------------------
router.delete('/:id/follow', verifyToken, async (req, res) => {
  try {
    const followerId = req.user.id;
    const followingId = req.params.id;

    await run(
      `UPDATE follows SET status = 'inactive' WHERE follower_id = ? AND following_id = ?`,
      [followerId, followingId]
    );

    const count = await get(`SELECT COUNT(*) as c FROM follows WHERE following_id=? AND status='active'`, [followingId]);
    res.json({ following: false, followersCount: count?.c || 0 });
  } catch (err) {
    res.status(500).json({ error: 'Failed to unfollow user.' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/users/:id/followers
// ---------------------------------------------------------------------------
router.get('/:id/followers', verifyToken, async (req, res) => {
  try {
    const rows = await all(
      `SELECT u.id, u.username, u.full_name, u.first_name, u.avatar
       FROM follows f JOIN users u ON f.follower_id = u.id
       WHERE f.following_id = ? AND f.status = 'active'
       ORDER BY f.created_at DESC LIMIT 50`,
      [req.params.id]
    );
    res.json({ users: rows.map(u => ({ id: u.id, username: u.username, fullName: u.full_name, firstName: u.first_name, avatar: u.avatar })) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load followers.' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/users/:id/following
// ---------------------------------------------------------------------------
router.get('/:id/following', verifyToken, async (req, res) => {
  try {
    const rows = await all(
      `SELECT u.id, u.username, u.full_name, u.first_name, u.avatar
       FROM follows f JOIN users u ON f.following_id = u.id
       WHERE f.follower_id = ? AND f.status = 'active'
       ORDER BY f.created_at DESC LIMIT 50`,
      [req.params.id]
    );
    res.json({ users: rows.map(u => ({ id: u.id, username: u.username, fullName: u.full_name, firstName: u.first_name, avatar: u.avatar })) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load following.' });
  }
});

module.exports = router;

