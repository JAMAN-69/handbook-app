'use strict';

/**
 * search.js — /api/search routes
 *
 * GET /api/search/users?q=     → search users
 * GET /api/search/posts?q=     → search posts by content/hashtag
 * GET /api/search/hashtags?q=  → search hashtags
 * GET /api/hashtags/trending   → trending hashtags
 */

const express = require('express');
const router = express.Router();
const { get, all } = require('../db');
const { verifyToken } = require('../middleware/authMiddleware');

// ---------------------------------------------------------------------------
// GET /api/search?q=  (combined search — users + posts + hashtags)
// ---------------------------------------------------------------------------
router.get('/', verifyToken, async (req, res) => {
  try {
    const q = `%${(req.query.q || '').trim()}%`;
    const viewerId = req.user.id;

    const userRows = await all(
      `SELECT u.id, u.username, u.full_name, u.first_name, u.avatar, u.bio
       FROM users u
       WHERE (u.full_name LIKE ? OR u.username LIKE ?)
         AND u.deactivated_at IS NULL
       ORDER BY u.full_name ASC LIMIT 10`,
      [q, q]
    );

    const postRows = await all(
      `SELECT p.*, u.username, u.full_name, u.first_name, u.avatar
       FROM posts p JOIN users u ON p.user_id = u.id
       WHERE p.content LIKE ? AND p.privacy = 'public'
       ORDER BY p.created_at DESC LIMIT 10`,
      [q]
    );

    const hashtagRows = await all(
      `SELECT id, name, posts_count FROM hashtags WHERE name LIKE ? ORDER BY posts_count DESC LIMIT 10`,
      [q]
    );

    const users = await Promise.all(userRows.map(async u => {
      const isFollowing = viewerId !== u.id
        ? !!(await get(`SELECT id FROM follows WHERE follower_id = ? AND following_id = ? AND status='active'`, [viewerId, u.id]))
        : false;
      return { id: u.id, username: u.username, fullName: u.full_name, firstName: u.first_name, avatar: u.avatar, bio: u.bio, isFollowing };
    }));

    const posts = postRows.map(r => ({
      id: r.id, content: r.content, feeling: r.feeling,
      likesCount: r.likes_count || 0, commentsCount: r.comments_count || 0,
      createdAt: r.created_at,
      author: { id: r.user_id, username: r.username, fullName: r.full_name, firstName: r.first_name, avatar: r.avatar },
    }));

    res.json({ users, posts, hashtags: hashtagRows });
  } catch (err) {
    res.status(500).json({ error: 'Search failed.' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/search/users?q=
// ---------------------------------------------------------------------------
router.get('/users', verifyToken, async (req, res) => {
  try {
    const q = `%${(req.query.q || '').trim()}%`;
    const viewerId = req.user.id;

    const rows = await all(
      `SELECT u.id, u.username, u.full_name, u.first_name, u.avatar, u.bio
       FROM users u
       WHERE (u.full_name LIKE ? OR u.username LIKE ?)
         AND u.deactivated_at IS NULL
       ORDER BY u.full_name ASC
       LIMIT 20`,
      [q, q]
    );

    // Add isFollowing flag for each result
    const users = await Promise.all(rows.map(async u => {
      const isFollowing = viewerId !== u.id
        ? !!(await get(`SELECT id FROM follows WHERE follower_id = ? AND following_id = ? AND status='active'`, [viewerId, u.id]))
        : false;
      return {
        id: u.id,
        username: u.username,
        fullName: u.full_name,
        firstName: u.first_name,
        avatar: u.avatar,
        bio: u.bio,
        isFollowing,
      };
    }));

    res.json({ users });
  } catch (err) {
    res.status(500).json({ error: 'User search failed.' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/search/posts?q=
// ---------------------------------------------------------------------------
router.get('/posts', verifyToken, async (req, res) => {
  try {
    const q = `%${(req.query.q || '').trim()}%`;

    const rows = await all(
      `SELECT p.*, u.username, u.full_name, u.first_name, u.avatar
       FROM posts p
       JOIN users u ON p.user_id = u.id
       WHERE p.content LIKE ? AND p.privacy = 'public'
       ORDER BY p.created_at DESC
       LIMIT 20`,
      [q]
    );

    const posts = rows.map(r => ({
      id: r.id,
      content: r.content,
      feeling: r.feeling,
      likesCount: r.likes_count || 0,
      commentsCount: r.comments_count || 0,
      createdAt: r.created_at,
      author: {
        id: r.user_id,
        username: r.username,
        fullName: r.full_name,
        firstName: r.first_name,
        avatar: r.avatar,
      },
    }));

    res.json({ posts });
  } catch (err) {
    res.status(500).json({ error: 'Post search failed.' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/search/hashtags?q=
// ---------------------------------------------------------------------------
router.get('/hashtags', verifyToken, async (req, res) => {
  try {
    const q = `%${(req.query.q || '').trim()}%`;
    const rows = await all(
      `SELECT id, name, posts_count FROM hashtags WHERE name LIKE ? ORDER BY posts_count DESC LIMIT 20`,
      [q]
    );
    res.json({ hashtags: rows });
  } catch (err) {
    res.status(500).json({ error: 'Hashtag search failed.' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/hashtags/trending — top 10 by posts_count
// ---------------------------------------------------------------------------
router.get('/trending', verifyToken, async (req, res) => {
  try {
    const rows = await all(
      `SELECT id, name, posts_count FROM hashtags ORDER BY posts_count DESC LIMIT 10`
    );
    res.json({ hashtags: rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load trending hashtags.' });
  }
});

module.exports = router;
