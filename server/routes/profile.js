'use strict';

require('dotenv').config();
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { run, get, all } = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-change-me';

// ---------------------------------------------------------------------------
// Auth middleware
// ---------------------------------------------------------------------------
function requireAuth(req, res, next) {
  const auth = req.headers['authorization'];
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  const token = auth.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.sub;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

function formatUser(user, emails = [], phones = []) {
  if (!user) return null;
  return {
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
    dob: user.dob,
    gender: user.gender,
    isPrivate: !!user.is_private,
    isOnline: !!user.is_online,
    lastSeen: user.last_seen,
    createdAt: user.created_at,
    emails: emails.map(e => e.email),
    phones: phones.map(p => p.phone),
  };
}

// ---------------------------------------------------------------------------
// GET /api/profile/me — Get current user's full profile
// ---------------------------------------------------------------------------
router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await get('SELECT * FROM users WHERE id = ? AND deactivated_at IS NULL', [req.userId]);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    const emails = await all('SELECT email FROM emails WHERE user_id = ? AND status = ?', [req.userId, 'active']);
    const phones = await all('SELECT phone FROM phones WHERE user_id = ? AND status = ?', [req.userId, 'active']);

    res.json({ success: true, user: formatUser(user, emails, phones) });
  } catch (err) {
    console.error('[Profile] /me error:', err.message);
    res.status(500).json({ error: 'Failed to load profile.' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/profile/:id — Get any user's public profile
// ---------------------------------------------------------------------------
router.get('/:id', async (req, res) => {
  try {
    const user = await get('SELECT * FROM users WHERE id = ? AND deactivated_at IS NULL', [req.params.id]);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    const emails = await all('SELECT email FROM emails WHERE user_id = ? AND status = ?', [req.params.id, 'active']);
    const phones = await all('SELECT phone FROM phones WHERE user_id = ? AND status = ?', [req.params.id, 'active']);

    res.json({ success: true, user: formatUser(user, emails, phones) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load profile.' });
  }
});

// ---------------------------------------------------------------------------
// PUT /api/profile — Update profile
// ---------------------------------------------------------------------------
router.put('/', requireAuth, async (req, res) => {
  try {
    const { firstName, lastName, bio, location, website, dob, gender, isPrivate, avatar, coverPhoto } = req.body;

    const updates = [];
    const params = [];

    if (firstName !== undefined) { updates.push('first_name = ?'); params.push(firstName.trim()); }
    if (lastName !== undefined) { updates.push('last_name = ?'); params.push(lastName.trim()); }
    if (firstName !== undefined || lastName !== undefined) {
      const user = await get('SELECT first_name, last_name FROM users WHERE id = ?', [req.userId]);
      const fn = firstName !== undefined ? firstName.trim() : user.first_name;
      const ln = lastName !== undefined ? lastName.trim() : user.last_name;
      updates.push('full_name = ?');
      params.push(`${fn} ${ln}`);
    }
    if (bio !== undefined) { updates.push('bio = ?'); params.push(bio); }
    if (location !== undefined) { updates.push('location = ?'); params.push(location); }
    if (website !== undefined) { updates.push('website = ?'); params.push(website); }
    if (dob !== undefined) { updates.push('dob = ?'); params.push(dob); }
    if (gender !== undefined) { updates.push('gender = ?'); params.push(gender); }
    if (isPrivate !== undefined) { updates.push('is_private = ?'); params.push(isPrivate ? 1 : 0); }
    if (avatar !== undefined) { updates.push('avatar = ?'); params.push(avatar); }
    if (coverPhoto !== undefined) { updates.push('cover_photo = ?'); params.push(coverPhoto); }

    if (updates.length === 0) return res.status(400).json({ error: 'No fields to update.' });

    params.push(req.userId);
    await run(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);

    const user = await get('SELECT * FROM users WHERE id = ?', [req.userId]);
    const emails = await all('SELECT email FROM emails WHERE user_id = ? AND status = ?', [req.userId, 'active']);
    const phones = await all('SELECT phone FROM phones WHERE user_id = ? AND status = ?', [req.userId, 'active']);

    res.json({ success: true, user: formatUser(user, emails, phones) });
  } catch (err) {
    console.error('[Profile] PUT error:', err.message);
    res.status(500).json({ error: 'Failed to update profile.' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/profile/password — Change password
// ---------------------------------------------------------------------------
router.post('/password', requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'currentPassword and newPassword are required.' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters.' });
    }

    const user = await get('SELECT * FROM users WHERE id = ?', [req.userId]);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    const match = await bcrypt.compare(currentPassword, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Current password is incorrect.' });

    const newHash = await bcrypt.hash(newPassword, 10);
    await run('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, req.userId]);

    res.json({ success: true, message: 'Password updated successfully.' });
  } catch (err) {
    console.error('[Profile] Password change error:', err.message);
    res.status(500).json({ error: 'Failed to change password.' });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/profile/deactivate — Soft-delete account
// ---------------------------------------------------------------------------
router.delete('/deactivate', requireAuth, async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: 'Password confirmation required.' });

    const user = await get('SELECT * FROM users WHERE id = ?', [req.userId]);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Incorrect password.' });

    await run(`UPDATE users SET deactivated_at = datetime('now'), is_online = 0 WHERE id = ?`, [req.userId]);
    // Invalidate all sessions
    await run('DELETE FROM sessions WHERE user_id = ?', [req.userId]);

    res.json({ success: true, message: 'Account deactivated. You can recover it within 30 days by logging in.' });
  } catch (err) {
    console.error('[Profile] Deactivate error:', err.message);
    res.status(500).json({ error: 'Failed to deactivate account.' });
  }
});

module.exports = router;
