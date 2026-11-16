'use strict';

require('dotenv').config();
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { run, get, all } = require('../db');
const { sendOtp, verifyOtp } = require('../otpService');
const { verifyFirebaseToken } = require('../firebaseAdmin');
const { verifyToken } = require('../middleware/authMiddleware');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-change-me';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'fallback-refresh-secret-change-me';
const ACCESS_TOKEN_TTL = '24h';
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// Stricter rate limit for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many auth attempts. Please try again in 15 minutes.' },
});
router.use(authLimiter);

// ---------------------------------------------------------------------------
// GET /api/auth/firebase-config
// Return public Firebase SDK configurations
// ---------------------------------------------------------------------------
router.get('/firebase-config', (req, res) => {
  res.json({
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    projectId: process.env.FIREBASE_PROJECT_ID,
    appId: process.env.FIREBASE_APP_ID,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID
  });
});


// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeAccessToken(userId) {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: ACCESS_TOKEN_TTL });
}

function makeRefreshToken(userId) {
  return jwt.sign({ sub: userId }, JWT_REFRESH_SECRET, { expiresIn: '30d' });
}

function cleanPhone(num) {
  if (!num) return '';
  return num.replace(/[^0-9+]/g, '');
}

async function saveSession(userId, refreshToken, req) {
  const id = crypto.randomUUID();
  const expiresAt = Date.now() + REFRESH_TOKEN_TTL_MS;
  await run(
    `INSERT INTO sessions (id, user_id, refresh_token, expires_at, user_agent, ip_address)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, userId, refreshToken, expiresAt,
     req.headers['user-agent'] || '',
     req.ip || '']
  );
}

async function findUserByIdentifier(identifier) {
  const isPhone = /^\+?[0-9\s\-().]{7,15}$/.test(identifier);
  if (isPhone) {
    const phone = await get(`SELECT user_id FROM phones WHERE phone = ? AND status = 'active'`, [identifier]);
    if (!phone) return null;
    return get('SELECT * FROM users WHERE id = ? AND deactivated_at IS NULL', [phone.user_id]);
  } else {
    const email = await get(`SELECT user_id FROM emails WHERE email = ? AND status = 'active'`, [identifier]);
    if (!email) return null;
    return get('SELECT * FROM users WHERE id = ? AND deactivated_at IS NULL', [email.user_id]);
  }
}

function formatUser(user) {
  if (!user) return null;
  const { password_hash, ...safe } = user;
  return {
    id: safe.id,
    username: safe.username,
    fullName: safe.full_name,
    firstName: safe.first_name,
    lastName: safe.last_name,
    avatar: safe.avatar,
    coverPhoto: safe.cover_photo,
    bio: safe.bio,
    location: safe.location,
    website: safe.website,
    isPrivate: !!safe.is_private,
    isOnline: !!safe.is_online,
    lastSeen: safe.last_seen,
    createdAt: safe.created_at,
  };
}

// ---------------------------------------------------------------------------
// POST /api/auth/otp/send
// Send OTP to email or phone (signup or reset)
// ---------------------------------------------------------------------------
router.post('/otp/send', async (req, res) => {
  try {
    const { identifier, purpose = 'signup' } = req.body;
    if (!identifier) return res.status(400).json({ error: 'identifier is required.' });

    const isPhone = /^\+?[0-9\s\-().]{7,15}$/.test(identifier);

    // For reset, check account exists first
    if (purpose === 'reset') {
      const user = await findUserByIdentifier(identifier);
      if (!user) return res.status(404).json({ error: 'No account found with this email or phone number.' });
    }

    // For signup, check if already registered (return 409)
    if (purpose === 'signup') {
      if (isPhone) {
        const existing = await get(`SELECT id FROM phones WHERE phone = ? AND status = 'active'`, [identifier]);
        if (existing) return res.status(409).json({ error: 'This phone number is already registered.' });
      } else {
        const existing = await get(`SELECT id FROM emails WHERE email = ? AND status = 'active'`, [identifier]);
        if (existing) return res.status(409).json({ error: 'This email address is already registered.' });
      }
    }

    await sendOtp(identifier, purpose);
    res.json({ success: true, message: 'Verification code sent.' });
  } catch (err) {
    const status = err.code === 'RATE_LIMITED' ? 429 : 500;
    res.status(status).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/auth/otp/verify
// Verify OTP code only (returns success boolean — used for pre-checking)
// ---------------------------------------------------------------------------
router.post('/otp/verify', async (req, res) => {
  try {
    const { identifier, code, purpose = 'signup' } = req.body;
    if (!identifier || !code) return res.status(400).json({ error: 'identifier and code are required.' });
    await verifyOtp(identifier, code, purpose);
    res.json({ success: true });
  } catch (err) {
    const status = ['EXPIRED', 'INVALID_CODE', 'MAX_ATTEMPTS', 'NOT_FOUND'].includes(err.code) ? 400 : 500;
    res.status(status).json({ error: err.message, code: err.code });
  }
});

// ---------------------------------------------------------------------------
// POST /api/auth/signup
// Create a new account after verifying OTP
// ---------------------------------------------------------------------------
router.post('/signup', async (req, res) => {
  try {
    const { firstName, lastName, email, phone, password, birthMonth, birthDay, birthYear, gender, otpCode, firebaseIdToken } = req.body;
    const identifier = email || phone;

    if (!identifier || !password || !firstName || !lastName) {
      return res.status(400).json({ error: 'First name, last name, email/phone and password are required.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    // Verify the OTP or Firebase ID Token
    if (firebaseIdToken) {
      try {
        const decodedToken = await verifyFirebaseToken(firebaseIdToken);
        const verifiedPhone = cleanPhone(decodedToken.phone_number);
        const submittedPhone = cleanPhone(phone);
        if (verifiedPhone !== submittedPhone && !verifiedPhone.endsWith(submittedPhone) && !submittedPhone.endsWith(verifiedPhone)) {
          return res.status(400).json({ error: 'Verified phone number does not match the submitted phone number.' });
        }
      } catch (err) {
        return res.status(400).json({ error: err.message });
      }
    } else {
      try {
        await verifyOtp(identifier, otpCode, 'signup');
      } catch (err) {
        return res.status(400).json({ error: err.message, code: err.code });
      }
    }

    // Check if email/phone already registered
    if (email) {
      const existing = await get('SELECT id FROM emails WHERE email = ?', [email]);
      if (existing) return res.status(409).json({ error: 'This email address is already registered.' });
    }
    if (phone) {
      const existing = await get('SELECT id FROM phones WHERE phone = ?', [phone]);
      if (existing) return res.status(409).json({ error: 'This phone number is already registered.' });
    }

    const id = crypto.randomUUID();
    const username = `${firstName.toLowerCase()}${lastName.toLowerCase()}${Math.floor(Math.random() * 9999)}`;
    const fullName = `${firstName.trim()} ${lastName.trim()}`;
    const passwordHash = await bcrypt.hash(password, 10);
    const dob = birthYear && birthMonth && birthDay
      ? `${birthYear}-${String(birthMonth).padStart(2,'0')}-${String(birthDay).padStart(2,'0')}`
      : null;
    const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(fullName)}&background=random&size=200`;

    await run(
      `INSERT INTO users (id, username, full_name, first_name, last_name, avatar, bio, dob, gender, password_hash, is_online, last_seen, created_at)
       VALUES (?, ?, ?, ?, ?, ?, '', ?, ?, ?, 1, datetime('now'), datetime('now'))`,
      [id, username, fullName, firstName.trim(), lastName.trim(), avatarUrl, dob, gender || null, passwordHash]
    );

    if (email) {
      await run(`INSERT INTO emails (id, user_id, email, status) VALUES (?, ?, ?, 'active')`,
        [crypto.randomUUID(), id, email]);
    }
    if (phone) {
      await run(`INSERT INTO phones (id, user_id, phone, status) VALUES (?, ?, ?, 'active')`,
        [crypto.randomUUID(), id, phone]);
    }

    const user = await get('SELECT * FROM users WHERE id = ?', [id]);
    const accessToken = makeAccessToken(id);
    const refreshToken = makeRefreshToken(id);
    await saveSession(id, refreshToken, req);

    res.status(201).json({
      success: true,
      user: { ...formatUser(user), email: email || null, emails: email ? [email] : [], phones: phone ? [phone] : [] },
      accessToken,
      refreshToken,
    });
  } catch (err) {
    console.error('[Auth] Signup error:', err.message);
    res.status(500).json({ error: 'Failed to create account. Please try again.' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/auth/login
// Login with email/phone + password
// ---------------------------------------------------------------------------
router.post('/login', async (req, res) => {
  try {
    const { identifier, password } = req.body;
    if (!identifier || !password) {
      return res.status(400).json({ error: 'Email/phone and password are required.' });
    }

    const user = await findUserByIdentifier(identifier);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email/phone or password.' });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid email/phone or password.' });
    }

    // Update online status
    await run(`UPDATE users SET is_online = 1, last_seen = datetime('now') WHERE id = ?`, [user.id]);

    const accessToken = makeAccessToken(user.id);
    const refreshToken = makeRefreshToken(user.id);
    await saveSession(user.id, refreshToken, req);

    // Get email/phones for response
    const emails = await all('SELECT email FROM emails WHERE user_id = ? AND status = ?', [user.id, 'active']);
    const phones = await all('SELECT phone FROM phones WHERE user_id = ? AND status = ?', [user.id, 'active']);

    res.json({
      success: true,
      user: {
        ...formatUser(user),
        email: emails.length > 0 ? emails[0].email : null,
        emails: emails.map(e => e.email),
        phones: phones.map(p => p.phone)
      },
      accessToken,
      refreshToken,
    });
  } catch (err) {
    console.error('[Auth] Login error:', err.message);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/auth/token/refresh
// Exchange refresh token for new access token
// ---------------------------------------------------------------------------
router.post('/token/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ error: 'refreshToken is required.' });

    // Verify signature
    let payload;
    try {
      payload = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
    } catch (e) {
      return res.status(401).json({ error: 'Invalid or expired refresh token.' });
    }

    // Check session exists and not expired
    const session = await get(
      `SELECT * FROM sessions WHERE refresh_token = ? AND expires_at > ?`,
      [refreshToken, Date.now()]
    );
    if (!session) return res.status(401).json({ error: 'Session expired. Please log in again.' });

    const user = await get('SELECT * FROM users WHERE id = ? AND deactivated_at IS NULL', [payload.sub]);
    if (!user) return res.status(401).json({ error: 'User not found.' });

    const accessToken = makeAccessToken(user.id);
    res.json({ success: true, accessToken });
  } catch (err) {
    console.error('[Auth] Token refresh error:', err.message);
    res.status(500).json({ error: 'Token refresh failed.' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/auth/logout
// ---------------------------------------------------------------------------
router.post('/logout', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      await run('DELETE FROM sessions WHERE refresh_token = ?', [refreshToken]);
      // Mark user offline
      try {
        const payload = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
        await run(`UPDATE users SET is_online = 0, last_seen = datetime('now') WHERE id = ?`, [payload.sub]);
      } catch (_) {}
    }
    res.json({ success: true });
  } catch (err) {
    res.json({ success: true }); // always succeed logout
  }
});

// ---------------------------------------------------------------------------
// POST /api/auth/password/search
// Find account and return info
// ---------------------------------------------------------------------------
router.post('/password/search', async (req, res) => {
  try {
    const { identifier } = req.body;
    if (!identifier) return res.status(400).json({ error: 'identifier is required.' });

    const user = await findUserByIdentifier(identifier);
    if (!user) {
      return res.status(404).json({ error: 'No account found matching that email or mobile number.' });
    }

    const emails = await all('SELECT email FROM emails WHERE user_id = ? AND status = ?', [user.id, 'active']);
    res.json({
      success: true,
      user: {
        id: user.id,
        fullName: user.full_name,
        avatar: user.avatar,
        emails: emails.map(e => e.email)
      }
    });
  } catch (err) {
    console.error('[Auth] Search error:', err.message);
    res.status(500).json({ error: 'Failed to search account.' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/auth/password/reset-request
// Find account and send OTP reset code
// ---------------------------------------------------------------------------
router.post('/password/reset-request', async (req, res) => {
  try {
    const { identifier } = req.body;
    if (!identifier) return res.status(400).json({ error: 'identifier is required.' });

    const user = await findUserByIdentifier(identifier);
    if (!user) {
      return res.status(404).json({ error: 'No account found matching that email or mobile number.' });
    }

    await sendOtp(identifier, 'reset');
    res.json({ success: true, userId: user.id, message: 'Verification code sent.' });
  } catch (err) {
    const status = err.code === 'RATE_LIMITED' ? 429 : 500;
    res.status(status).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/auth/password/reset-confirm
// Verify OTP + log user in directly (no new password required per spec)
// ---------------------------------------------------------------------------
router.post('/password/reset-confirm', async (req, res) => {
  try {
    const { identifier, code, userId, firebaseIdToken } = req.body;
    if (!identifier || (!code && !firebaseIdToken)) {
      return res.status(400).json({ error: 'identifier and verification code/token are required.' });
    }

    // Verify token or OTP
    if (firebaseIdToken) {
      try {
        const decodedToken = await verifyFirebaseToken(firebaseIdToken);
        const verifiedPhone = cleanPhone(decodedToken.phone_number);
        const submittedPhone = cleanPhone(identifier);
        if (verifiedPhone !== submittedPhone && !verifiedPhone.endsWith(submittedPhone) && !submittedPhone.endsWith(verifiedPhone)) {
          return res.status(400).json({ error: 'Verified phone number does not match the submitted identifier.' });
        }
      } catch (err) {
        return res.status(400).json({ error: err.message });
      }
    } else {
      try {
        await verifyOtp(identifier, code, 'reset');
      } catch (err) {
        return res.status(400).json({ error: err.message, code: err.code });
      }
    }

    // Find user
    const user = userId
      ? await get('SELECT * FROM users WHERE id = ? AND deactivated_at IS NULL', [userId])
      : await findUserByIdentifier(identifier);

    if (!user) return res.status(404).json({ error: 'Account not found.' });

    // Log them in directly
    await run(`UPDATE users SET is_online = 1, last_seen = datetime('now') WHERE id = ?`, [user.id]);

    const accessToken = makeAccessToken(user.id);
    const refreshToken = makeRefreshToken(user.id);
    await saveSession(user.id, refreshToken, req);

    const emails = await all('SELECT email FROM emails WHERE user_id = ? AND status = ?', [user.id, 'active']);
    const phones = await all('SELECT phone FROM phones WHERE user_id = ? AND status = ?', [user.id, 'active']);

    res.json({
      success: true,
      user: { ...formatUser(user), emails: emails.map(e => e.email), phones: phones.map(p => p.phone) },
      accessToken,
      refreshToken,
    });
  } catch (err) {
    console.error('[Auth] Reset confirm error:', err.message);
    res.status(500).json({ error: 'Password reset failed. Please try again.' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/auth/password/force-reset
// Set new password after reset verification
// ---------------------------------------------------------------------------
router.post('/password/force-reset', verifyToken, async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) return res.status(400).json({error:'Password too short'});
    const bcrypt = require('bcryptjs');
    const newHash = await bcrypt.hash(newPassword, 10);
    await run('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, req.userId]);
    res.json({success: true});
  } catch(err) {
    console.error('[Auth] Force reset error:', err.message);
    res.status(500).json({error:'Failed to update password.'});
  }
});

module.exports = router;
