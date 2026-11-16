'use strict';

const express = require('express');
const router = express.Router();
const { run, get, all } = require('../db');
const { verifyToken } = require('../middleware/authMiddleware');
const crypto = require('crypto');

// GET /api/stories — active stories (24hr) of current user + friends + followed
router.get('/', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const follows = await all(
      `SELECT following_id FROM follows WHERE follower_id = ? AND status = 'active'`,
      [userId]
    );
    const followingIds = follows.map(f => f.following_id);

    const friends = await all(
      `SELECT CASE WHEN requester_id=? THEN receiver_id ELSE requester_id END as fid
       FROM friendships WHERE (requester_id=? OR receiver_id=?) AND status='accepted'`,
      [userId, userId, userId]
    );
    const friendIds = friends.map(f => f.fid);

    const allIds = [...new Set([userId, ...followingIds, ...friendIds])];
    const placeholders = allIds.map(() => '?').join(',');

    const rows = await all(
      `SELECT s.*, u.username, u.full_name, u.avatar
       FROM stories s
       JOIN users u ON s.user_id = u.id
       WHERE s.user_id IN (${placeholders})
         AND datetime(s.expires_at) > datetime('now')
       ORDER BY s.created_at DESC`,
      allIds
    );

    const grouped = {};
    for (const row of rows) {
      if (!grouped[row.user_id]) {
        grouped[row.user_id] = {
          userId: row.user_id,
          username: row.username,
          fullName: row.full_name,
          avatar: row.avatar,
          stories: [],
        };
      }

      const viewerSeen = await get(
        `SELECT id FROM story_views WHERE story_id = ? AND viewer_id = ?`,
        [row.id, userId]
      );

      // Reactions summary
      const reactRows = await all(
        `SELECT reaction, COUNT(*) as cnt FROM story_reactions WHERE story_id = ? GROUP BY reaction`,
        [row.id]
      );
      const reactions = {};
      for (const r of reactRows) reactions[r.reaction] = r.cnt;

      // Reactor list (for own stories only)
      let reactorList = [];
      if (row.user_id === userId) {
        const rl = await all(
          `SELECT sr.reaction, u.id, u.username, u.full_name, u.avatar
           FROM story_reactions sr JOIN users u ON sr.user_id = u.id
           WHERE sr.story_id = ? ORDER BY sr.created_at DESC`,
          [row.id]
        );
        reactorList = rl.map(r => ({
          reaction: r.reaction,
          id: r.id,
          username: r.username,
          fullName: r.full_name,
          avatar: r.avatar
        }));
      }

      // Viewer's own reaction
      const myReact = await get(
        `SELECT reaction FROM story_reactions WHERE story_id = ? AND user_id = ?`,
        [row.id, userId]
      );

      grouped[row.user_id].stories.push({
        id: row.id,
        mediaUrl: row.media_url,
        mediaType: row.media_type,
        caption: row.caption || '',
        duration: row.duration,
        viewCount: row.views_count,
        createdAt: row.created_at ? row.created_at.replace(' ', 'T') + 'Z' : null,
        expiresAt: row.expires_at,
        seen: !!viewerSeen,
        reactions,
        reactorList,
        myReaction: myReact?.reaction || null,
      });
    }

    res.json({ success: true, storyGroups: Object.values(grouped) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/stories — Create a story (24hr expiry)
router.post('/', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { mediaUrl, mediaType = 'image', caption = '', duration = 5 } = req.body;
    if (!mediaUrl) return res.status(400).json({ error: 'Media URL required.' });

    const storyId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    await run(
      `INSERT INTO stories (id, user_id, media_url, media_type, caption, duration, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [storyId, userId, mediaUrl, mediaType, caption, duration, expiresAt]
    );

    const story = await get(`SELECT * FROM stories WHERE id = ?`, [storyId]);
    res.status(201).json({ success: true, story });
  } catch (err) {
    console.error('[Story Upload Error]:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/stories/:id/view — Mark as viewed
router.post('/:id/view', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const storyId = req.params.id;
    const story = await get(`SELECT id FROM stories WHERE id = ?`, [storyId]);
    if (!story) return res.status(404).json({ error: 'Story not found.' });

    const before = await get(
      `SELECT id FROM story_views WHERE story_id = ? AND viewer_id = ?`,
      [storyId, userId]
    );
    await run(
      `INSERT OR IGNORE INTO story_views (id, story_id, viewer_id, viewed_at) VALUES (?, ?, ?, datetime('now'))`,
      [crypto.randomUUID(), storyId, userId]
    );
    if (!before) {
      await run(`UPDATE stories SET views_count = views_count + 1 WHERE id = ?`, [storyId]);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/stories/:id/react — React to story (or remove reaction if reaction=null)
router.post('/:id/react', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const storyId = req.params.id;
    const { reaction } = req.body;

    if (!reaction) {
      await run(`DELETE FROM story_reactions WHERE story_id = ? AND user_id = ?`, [storyId, userId]);
      return res.json({ success: true, action: 'removed' });
    }

    const valid = ['like', 'love', 'haha', 'wow', 'sad', 'angry'];
    if (!valid.includes(reaction)) return res.status(400).json({ error: 'Invalid reaction.' });

    await run(
      `INSERT INTO story_reactions (id, story_id, user_id, reaction, created_at)
       VALUES (?, ?, ?, ?, datetime('now'))
       ON CONFLICT(story_id, user_id) DO UPDATE SET reaction=excluded.reaction, created_at=datetime('now')`,
      [crypto.randomUUID(), storyId, userId, reaction]
    );
    res.json({ success: true, action: 'reacted', reaction });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/stories/:id/edit — Edit caption (own story)
router.post('/:id/edit', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const storyId = req.params.id;
    const { caption = '' } = req.body;
    const story = await get(`SELECT id, user_id FROM stories WHERE id = ?`, [storyId]);
    if (!story) return res.status(404).json({ error: 'Story not found.' });
    if (story.user_id !== userId) return res.status(403).json({ error: 'Not your story.' });
    await run(`UPDATE stories SET caption = ? WHERE id = ?`, [caption, storyId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/stories/:id/delete — Delete own story
router.post('/:id/delete', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const storyId = req.params.id;
    const story = await get(`SELECT id, user_id FROM stories WHERE id = ?`, [storyId]);
    if (!story) return res.status(404).json({ error: 'Story not found.' });
    if (story.user_id !== userId) return res.status(403).json({ error: 'Not your story.' });
    await run(`DELETE FROM stories WHERE id = ?`, [storyId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
