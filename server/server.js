'use strict';

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { initDb } = require('./db');

const app = express();
const PORT = process.env.PORT || 5000;

// Trust Render/Railway/Heroku reverse proxy (fixes X-Forwarded-For rate-limit warning)
app.set('trust proxy', 1);

// ---------------------------------------------------------------------------
// Security Middleware
// ---------------------------------------------------------------------------
app.use(helmet({
  contentSecurityPolicy: false, // disabled so inline scripts in frontend work
  crossOriginEmbedderPolicy: false,
}));
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  next();
});

// Serve static frontend files
app.use(express.static(path.join(__dirname, '..')));

// Global API rate limiter
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200, // 200 req/min per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' },
});
app.use('/api', globalLimiter);

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
app.use('/api/auth',          require('./routes/auth'));
app.use('/api/profile',       require('./routes/profile'));
app.use('/api/posts',         require('./routes/posts'));
app.use('/api/users',         require('./routes/users'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/search',        require('./routes/search'));
app.use('/api/friends',       require('./routes/friends'));
app.use('/api/stories',       require('./routes/stories'));

// ---------------------------------------------------------------------------
// SPA fallback — serve index.html for all non-API routes
// ---------------------------------------------------------------------------
app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'index.html'));
});

// ---------------------------------------------------------------------------
// Global error handler
// ---------------------------------------------------------------------------
app.use((err, req, res, next) => {
  console.error('[Server Error]', err.message);
  res.status(500).json({ error: 'Internal server error.' });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
(async () => {
  try {
    await initDb();
    app.listen(PORT, () => {
      console.log(`\n🚀 Handbook server running at http://localhost:${PORT}`);
      console.log(`   Frontend: http://localhost:${PORT}`);
      console.log(`   API:      http://localhost:${PORT}/api\n`);
      console.log(`   Routes:`);
      console.log(`     POST/GET /api/posts      (feed, create, like, comment)`);
      console.log(`     GET      /api/users      (profile, follow, search)`);
      console.log(`     GET      /api/notifications`);
      console.log(`     GET      /api/search\n`);
    });
  } catch (err) {
    console.error('[FATAL] Failed to start server:', err.message);
    process.exit(1);
  }
})();
