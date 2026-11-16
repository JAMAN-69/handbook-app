'use strict';

/**
 * posts.js — /api/posts routes
 *
 * POST   /api/posts          → create post
 * GET    /api/posts/feed      → get personalized feed
 * GET    /api/posts/:id       → single post
 * DELETE /api/posts/:id       → delete post
 */

const express = require('express');
const router = express.Router();
const { run, get, all } = require('../db');
const { verifyToken } = require('../middleware/authMiddleware');
const crypto = require('crypto');

// ---------------------------------------------------------------------------
// Helper — format a DB post row into a clean object for the frontend
// ---------------------------------------------------------------------------
async function formatPost(row, viewerId = null) {
  if (!row) return null;

  // Author info
  const author = await get(
    `SELECT u.id, u.username, u.full_name, u.first_name, u.avatar
     FROM users u WHERE u.id = ?`,
    [row.user_id]
  );

  // Media
  const media = await all(
    `SELECT media_url, media_type FROM post_media WHERE post_id = ? ORDER BY rowid ASC`,
    [row.id]
  );

  // Viewer reaction
  let viewerLiked = false;
  let viewerReaction = null;
  let viewerSaved = false;
  if (viewerId) {
    const reaction = await get(
      `SELECT reaction_type FROM post_reactions WHERE post_id = ? AND user_id = ?`,
      [row.id, viewerId]
    );
    viewerLiked = !!reaction;
    viewerReaction = reaction ? reaction.reaction_type : null;

    const bookmark = await get(
      `SELECT id FROM bookmarks WHERE post_id = ? AND user_id = ?`,
      [row.id, viewerId]
    );
    viewerSaved = !!bookmark;
  }

  return {
    id: row.id,
    content: row.content,
    feeling: row.feeling,
    location: row.location,
    privacy: row.privacy,
    likesCount: row.likes_count || 0,
    commentsCount: row.comments_count || 0,
    sharesCount: row.shares_count || 0,
    createdAt: row.created_at ? row.created_at.replace(' ', 'T') + 'Z' : null,
    updatedAt: row.updated_at ? row.updated_at.replace(' ', 'T') + 'Z' : null,
    viewerLiked,
    viewerReaction,
    viewerSaved,
    media: media.map(m => ({ url: m.media_url, type: m.media_type })),
    author: author ? {
      id: author.id,
      username: author.username,
      fullName: author.full_name,
      firstName: author.first_name,
      avatar: author.avatar,
    } : null,
  };
}

// ---------------------------------------------------------------------------
// POST /api/posts — Create a new post
// ---------------------------------------------------------------------------
router.post('/', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { content, feeling, location, privacy = 'public', media = [] } = req.body;

    if (!content && media.length === 0) {
      return res.status(400).json({ error: 'Post must have text or media.' });
    }

    const postId = crypto.randomUUID();
    const now = new Date().toISOString();

    await run(
      `INSERT INTO posts (id, user_id, content, feeling, location, privacy, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [postId, userId, content || null, feeling || null, location || null, privacy, now, now]
    );

    // Insert media items
    for (const item of media) {
      if (item.url) {
        const mediaId = crypto.randomUUID();
        await run(
          `INSERT INTO post_media (id, post_id, user_id, media_url, media_type, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [mediaId, postId, userId, item.url, item.type || 'image', now]
        );
      }
    }

    // Parse hashtags from content
    if (content) {
      const tags = [...new Set((content.match(/#(\w+)/g) || []).map(t => t.slice(1).toLowerCase()))];
      for (const tag of tags) {
        let hashtag = await get(`SELECT id FROM hashtags WHERE name = ?`, [tag]);
        if (!hashtag) {
          const hid = crypto.randomUUID();
          await run(`INSERT INTO hashtags (id, name, posts_count) VALUES (?, ?, 1)`, [hid, tag]);
          hashtag = { id: hid };
        } else {
          await run(`UPDATE hashtags SET posts_count = posts_count + 1 WHERE id = ?`, [hashtag.id]);
        }
        await run(
          `INSERT OR IGNORE INTO post_hashtags (post_id, hashtag_id) VALUES (?, ?)`,
          [postId, hashtag.id]
        ).catch(() => {});
      }
    }

    const row = await get(`SELECT * FROM posts WHERE id = ?`, [postId]);
    const post = await formatPost(row, userId);

    res.status(201).json({ post });
  } catch (err) {
    console.error('[Posts] Create error:', err.message);
    res.status(500).json({ error: 'Failed to create post.' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/posts/feed — Personalized feed (own + followed users)
// ---------------------------------------------------------------------------
router.get('/feed', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const page = Math.max(0, parseInt(req.query.page) || 0);
    const limit = Math.min(20, parseInt(req.query.limit) || 10);
    const offset = page * limit;

    // Get followed user IDs
    const follows = await all(
      `SELECT following_id FROM follows WHERE follower_id = ? AND status = 'active'`,
      [userId]
    );
    const followingIds = follows.map(f => f.following_id);
    const allIds = [userId, ...followingIds];

    let rows, total;

    if (allIds.length <= 1) {
      // No follows: show all public posts (discovery/explore mode)
      rows = await all(
        `SELECT * FROM posts WHERE privacy = 'public' ORDER BY created_at DESC LIMIT ? OFFSET ?`,
        [limit, offset]
      );
      const countRow = await get(
        `SELECT COUNT(*) as total FROM posts WHERE privacy = 'public'`
      );
      total = countRow?.total || 0;
    } else {
      // Show own + followed posts
      const placeholders = allIds.map(() => '?').join(',');
      rows = await all(
        `SELECT * FROM posts
         WHERE user_id IN (${placeholders})
           AND privacy IN ('public', 'friends')
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`,
        [...allIds, limit, offset]
      );
      const countRow = await get(
        `SELECT COUNT(*) as total FROM posts WHERE user_id IN (${placeholders}) AND privacy IN ('public','friends')`,
        allIds
      );
      total = countRow?.total || 0;
    }

    const posts = await Promise.all(rows.map(r => formatPost(r, userId)));

    res.json({
      posts,
      page,
      limit,
      total,
      hasMore: offset + rows.length < total,
    });
  } catch (err) {
    console.error('[Posts] Feed error:', err.message);
    res.status(500).json({ error: 'Failed to load feed.' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/posts/reels — Get posts containing videos to show as reels
// ---------------------------------------------------------------------------
router.get('/reels', verifyToken, async (req, res) => {
  try {
    const viewerId = req.user.id;
    const rows = await all(
      `SELECT DISTINCT p.* FROM posts p
       JOIN post_media pm ON p.id = pm.post_id
       WHERE pm.media_type = 'video'
       ORDER BY p.created_at DESC LIMIT 20`
    );
    let reels = await Promise.all(rows.map(r => formatPost(r, viewerId)));
    if (reels.length === 0) {
      reels = [
        {
          id: "mock-reel-1",
          content: "Enjoying the autumn breeze! 🍂✨ #nature #peaceful",
          createdAt: new Date(Date.now() - 3600000).toISOString(),
          likesCount: 142,
          commentsCount: 18,
          sharesCount: 5,
          viewerLiked: false,
          viewerReaction: null,
          author: {
            id: "system-author-1",
            fullName: "Aria Thorne",
            username: "ariathorne",
            avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&q=80"
          },
          media: [
            {
              type: "video",
              url: "https://assets.mixkit.co/videos/preview/mixkit-tree-with-yellow-leaves-in-autumn-4729-large.mp4"
            }
          ]
        },
        {
          id: "mock-reel-2",
          content: "Late night drives in the city. 🌃🚗 #citylife #neon #drive",
          createdAt: new Date(Date.now() - 7200000).toISOString(),
          likesCount: 389,
          commentsCount: 42,
          sharesCount: 12,
          viewerLiked: true,
          viewerReaction: "like",
          author: {
            id: "system-author-2",
            fullName: "Zack Rider",
            username: "zackrider",
            avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&q=80"
          },
          media: [
            {
              type: "video",
              url: "https://assets.mixkit.co/videos/preview/mixkit-traffic-in-a-large-city-at-night-42289-large.mp4"
            }
          ]
        },
        {
          id: "mock-reel-3",
          content: "Mesmerizing ocean waves from above! 🌊😍 #ocean #satisfying #drone",
          createdAt: new Date(Date.now() - 10800000).toISOString(),
          likesCount: 512,
          commentsCount: 65,
          sharesCount: 34,
          viewerLiked: false,
          viewerReaction: null,
          author: {
            id: "system-author-3",
            fullName: "Luna Sea",
            username: "lunasea",
            avatar: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150&q=80"
          },
          media: [
            {
              type: "video",
              url: "https://assets.mixkit.co/videos/preview/mixkit-waves-breaking-on-the-shore-from-above-41902-large.mp4"
            }
          ]
        }
      ];
    }
    res.json({ success: true, reels });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/posts/:id — Single post
// ---------------------------------------------------------------------------
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const row = await get(`SELECT * FROM posts WHERE id = ?`, [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Post not found.' });
    const post = await formatPost(row, req.user.id);
    res.json({ post });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load post.' });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/posts/:id — Delete own post
// ---------------------------------------------------------------------------
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const row = await get(`SELECT user_id FROM posts WHERE id = ?`, [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Post not found.' });
    if (row.user_id !== req.user.id) return res.status(403).json({ error: 'Not authorized.' });

    await run(`DELETE FROM posts WHERE id = ?`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete post.' });
  }
});

// ---------------------------------------------------------------------------
// PUT /api/posts/:id — Edit a post
// ---------------------------------------------------------------------------
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const { content, feeling, location, media } = req.body;
    const postId = req.params.id;
    const userId = req.user.id;

    const row = await get(`SELECT user_id FROM posts WHERE id = ?`, [postId]);
    if (!row) return res.status(404).json({ error: 'Post not found.' });
    if (row.user_id !== userId) return res.status(403).json({ error: 'Not authorized.' });

    const now = new Date().toISOString();
    await run(
      `UPDATE posts SET content = ?, feeling = ?, location = ?, updated_at = ? WHERE id = ?`,
      [content || null, feeling || null, location || null, now, postId]
    );

    // Update media items if passed
    if (Array.isArray(media)) {
      await run(`DELETE FROM post_media WHERE post_id = ?`, [postId]);
      for (const item of media) {
        if (item.url) {
          const mediaId = crypto.randomUUID();
          await run(
            `INSERT INTO post_media (id, post_id, user_id, media_url, media_type, created_at)
              VALUES (?, ?, ?, ?, ?, ?)`,
            [mediaId, postId, userId, item.url, item.type || 'image', now]
          );
        }
      }
    }

    const updated = await get(`SELECT * FROM posts WHERE id = ?`, [postId]);
    const post = await formatPost(updated, userId);
    res.json({ post });
  } catch (err) {
    console.error('[Posts] Edit error:', err.message);
    res.status(500).json({ error: 'Failed to edit post.' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/posts/:id/like — Like a post
// ---------------------------------------------------------------------------
router.post('/:id/like', verifyToken, async (req, res) => {
  try {
    const { id: postId } = req.params;
    const userId = req.user.id;

    const post = await get(`SELECT id, user_id, likes_count FROM posts WHERE id = ?`, [postId]);
    if (!post) return res.status(404).json({ error: 'Post not found.' });

    const existing = await get(
      `SELECT id FROM post_likes WHERE post_id = ? AND user_id = ?`,
      [postId, userId]
    );

    if (existing) {
      // Unlike
      await run(`DELETE FROM post_likes WHERE post_id = ? AND user_id = ?`, [postId, userId]);
      await run(`UPDATE posts SET likes_count = MAX(0, likes_count - 1) WHERE id = ?`, [postId]);

      const updated = await get(`SELECT likes_count FROM posts WHERE id = ?`, [postId]);
      return res.json({ liked: false, likesCount: updated.likes_count });
    } else {
      // Like
      const likeId = crypto.randomUUID();
      const reaction = req.body.reaction || 'like';
      await run(
        `INSERT INTO post_likes (id, post_id, user_id, reaction, created_at) VALUES (?, ?, ?, ?, datetime('now'))`,
        [likeId, postId, userId, reaction]
      );
      await run(`UPDATE posts SET likes_count = likes_count + 1 WHERE id = ?`, [postId]);

      // Create notification (don't block on this)
      if (post.user_id !== userId) {
        const notifId = crypto.randomUUID();
        run(
          `INSERT INTO notifications (id, user_id, actor_id, type, post_id, created_at)
           VALUES (?, ?, ?, 'like', ?, datetime('now'))`,
          [notifId, post.user_id, userId, postId]
        ).catch(() => {});
      }

      const updated = await get(`SELECT likes_count FROM posts WHERE id = ?`, [postId]);
      return res.json({ liked: true, likesCount: updated.likes_count });
    }
  } catch (err) {
    console.error('[Posts] Like error:', err.message);
    res.status(500).json({ error: 'Failed to like post.' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/posts/:id/share — Share a post (increment shares_count)
// ---------------------------------------------------------------------------
router.post('/:id/share', verifyToken, async (req, res) => {
  try {
    const { id: postId } = req.params;
    const post = await get('SELECT id, shares_count FROM posts WHERE id = ?', [postId]);
    if (post) {
      await run('UPDATE posts SET shares_count = shares_count + 1 WHERE id = ?', [postId]);
      const updated = await get('SELECT shares_count FROM posts WHERE id = ?', [postId]);
      return res.json({ success: true, sharesCount: updated ? updated.shares_count : (post.shares_count || 0) + 1 });
    }
    res.json({ success: true, sharesCount: 1 });
  } catch (err) {
    res.status(500).json({ error: 'Failed to share post.' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/posts/:id/comments — Get comments for a post
// ---------------------------------------------------------------------------
router.get('/:id/comments', verifyToken, async (req, res) => {
  try {
    const { id: postId } = req.params;
    const page = Math.max(0, parseInt(req.query.page) || 0);
    const limit = Math.min(50, parseInt(req.query.limit) || 20);
    const offset = page * limit;

    const rows = await all(
      `SELECT c.*, u.username, u.full_name, u.first_name, u.avatar
       FROM comments c
       JOIN users u ON c.user_id = u.id
       WHERE c.post_id = ? AND c.parent_id IS NULL
       ORDER BY c.created_at ASC
       LIMIT ? OFFSET ?`,
      [postId, limit, offset]
    );

    const comments = rows.map(r => ({
      id: r.id,
      content: r.content,
      likesCount: r.likes_count || 0,
      createdAt: r.created_at ? r.created_at.replace(' ', 'T') + 'Z' : null,
      author: {
        id: r.user_id,
        username: r.username,
        fullName: r.full_name,
        firstName: r.first_name,
        avatar: r.avatar,
      },
    }));

    res.json({ comments, page, limit });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load comments.' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/posts/:id/comments — Add a comment
// ---------------------------------------------------------------------------
router.post('/:id/comments', verifyToken, async (req, res) => {
  try {
    const { id: postId } = req.params;
    const userId = req.user.id;
    const { content, parentId = null } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Comment cannot be empty.' });
    }

    const post = await get(`SELECT id, user_id FROM posts WHERE id = ?`, [postId]);
    if (!post) return res.status(404).json({ error: 'Post not found.' });

    const commentId = crypto.randomUUID();
    await run(
      `INSERT INTO comments (id, post_id, user_id, parent_id, content, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      [commentId, postId, userId, parentId || null, content.trim()]
    );
    await run(`UPDATE posts SET comments_count = comments_count + 1 WHERE id = ?`, [postId]);

    // Notification
    if (post.user_id !== userId) {
      const notifId = crypto.randomUUID();
      run(
        `INSERT INTO notifications (id, user_id, actor_id, type, post_id, comment_id, created_at)
         VALUES (?, ?, ?, 'comment', ?, ?, datetime('now'))`,
        [notifId, post.user_id, userId, postId, commentId]
      ).catch(() => {});
    }

    const author = await get(
      `SELECT id, username, full_name, first_name, avatar FROM users WHERE id = ?`,
      [userId]
    );

    res.status(201).json({
      comment: {
        id: commentId,
        content: content.trim(),
        likesCount: 0,
        createdAt: new Date().toISOString(),
        author: {
          id: author.id,
          username: author.username,
          fullName: author.full_name,
          firstName: author.first_name,
          avatar: author.avatar,
        },
      },
    });
  } catch (err) {
    console.error('[Posts] Comment error:', err.message);
    res.status(500).json({ error: 'Failed to add comment.' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/posts/user/:userId — Posts by a specific user (profile page)
// ---------------------------------------------------------------------------
router.get('/user/:userId', verifyToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const viewerId = req.user.id;
    const page = Math.max(0, parseInt(req.query.page) || 0);
    const limit = Math.min(20, parseInt(req.query.limit) || 10);
    const offset = page * limit;

    const rows = await all(
      `SELECT * FROM posts WHERE user_id = ?
       ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [userId, limit, offset]
    );

    const countRow = await get(`SELECT COUNT(*) as cnt FROM posts WHERE user_id = ?`, [userId]);
    const total = countRow?.cnt || 0;

    const posts = await Promise.all(rows.map(r => formatPost(r, viewerId)));
    res.json({ posts, page, limit, total, hasMore: offset + rows.length < total });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load user posts.' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/posts/:id/react — add / update / remove an emoji reaction
// ---------------------------------------------------------------------------
router.post('/:id/react', verifyToken, async (req, res) => {
  try {
    const postId = req.params.id;
    const userId = req.user.id;
    const { type } = req.body; // 'like','love','care','haha','wow','sad','angry' or null to remove

    const post = await get('SELECT id, likes_count FROM posts WHERE id=?', [postId]);
    if (!post) return res.status(404).json({ error: 'Post not found.' });

    const existing = await get(
      'SELECT id, reaction_type FROM post_reactions WHERE post_id=? AND user_id=?',
      [postId, userId]
    );

    // Remove reaction if type is null or same as current reaction (toggle off)
    if (!type || (existing && existing.reaction_type === type)) {
      if (existing) {
        await run('DELETE FROM post_reactions WHERE id=?', [existing.id]);
        await run('UPDATE posts SET likes_count = MAX(0, likes_count - 1) WHERE id=?', [postId]);
      }
      const updated = await get('SELECT likes_count FROM posts WHERE id=?', [postId]);
      return res.json({
        success: true,
        action: 'removed',
        likesCount: updated ? updated.likes_count : Math.max(0, (post.likes_count || 0) - (existing ? 1 : 0)),
      });
    }

    if (existing) {
      // Switch reaction type (no count change)
      await run('UPDATE post_reactions SET reaction_type=? WHERE id=?', [type, existing.id]);
    } else {
      // New reaction
      await run(
        'INSERT INTO post_reactions (id, post_id, user_id, reaction_type) VALUES (?,?,?,?)',
        [crypto.randomUUID(), postId, userId, type]
      );
      await run('UPDATE posts SET likes_count = likes_count + 1 WHERE id=?', [postId]);
    }

    const updated = await get('SELECT likes_count FROM posts WHERE id=?', [postId]);
    res.json({ success: true, action: 'reacted', reactionType: type, likesCount: updated.likes_count });
  } catch (err) {
    console.error('[Posts] React error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/posts/:id/reactions — reaction summary + viewer's own reaction
// ---------------------------------------------------------------------------
router.get('/:id/reactions', verifyToken, async (req, res) => {
  try {
    const postId = req.params.id;
    const userId = req.user.id;
    const reactions = await all(
      `SELECT reaction_type, COUNT(*) as count FROM post_reactions WHERE post_id=? GROUP BY reaction_type`,
      [postId]
    );
    const myReaction = await get(
      'SELECT reaction_type FROM post_reactions WHERE post_id=? AND user_id=?',
      [postId, userId]
    );
    res.json({
      success: true,
      reactions,
      myReaction: myReaction ? myReaction.reaction_type : null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/posts/:id/bookmark — Toggle bookmark (save/unsave)
// ---------------------------------------------------------------------------
router.post('/:id/bookmark', verifyToken, async (req, res) => {
  try {
    const { id: postId } = req.params;
    const userId = req.user.id;

    const existing = await get(
      `SELECT id FROM bookmarks WHERE user_id = ? AND post_id = ?`,
      [userId, postId]
    );

    if (existing) {
      await run(`DELETE FROM bookmarks WHERE user_id = ? AND post_id = ?`, [userId, postId]);
      return res.json({ saved: false, message: 'Post removed from saved.' });
    } else {
      const id = require('crypto').randomUUID();
      await run(
        `INSERT INTO bookmarks (id, user_id, post_id) VALUES (?, ?, ?)`,
        [id, userId, postId]
      );
      return res.json({ saved: true, message: 'Post saved!' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to toggle bookmark.' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/posts/saved — Get all saved/bookmarked posts for current user
// ---------------------------------------------------------------------------
router.get('/saved/all', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const page = Math.max(0, parseInt(req.query.page) || 0);
    const limit = Math.min(20, parseInt(req.query.limit) || 10);
    const offset = page * limit;

    const rows = await all(
      `SELECT p.* FROM posts p
       INNER JOIN bookmarks b ON b.post_id = p.id
       WHERE b.user_id = ?
       ORDER BY b.created_at DESC
       LIMIT ? OFFSET ?`,
      [userId, limit, offset]
    );

    const countRow = await get(
      `SELECT COUNT(*) as cnt FROM bookmarks WHERE user_id = ?`,
      [userId]
    );
    const total = countRow?.cnt || 0;

    const posts = await Promise.all(rows.map(r => formatPost(r, userId)));
    res.json({ posts, total, hasMore: offset + rows.length < total });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load saved posts.' });
  }
});

module.exports = router;
