'use strict';

const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, '..', 'handbook.db');

let db;

function getDb() {
  if (!db) {
    db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) console.error('[DB] Failed to open:', err.message);
      else console.log('[DB] Connected to handbook.db');
    });
    db.run('PRAGMA foreign_keys = ON');
    db.run('PRAGMA journal_mode = WAL');
  }
  return db;
}

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDb().run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDb().get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDb().all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function initDb() {
  // ── AUTH TABLES ──────────────────────────────────────────────────────────

  // Users table
  await run(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    first_name TEXT,
    last_name TEXT,
    avatar TEXT,
    cover_photo TEXT,
    bio TEXT DEFAULT '',
    location TEXT DEFAULT '',
    website TEXT DEFAULT '',
    dob TEXT,
    gender TEXT,
    password_hash TEXT NOT NULL,
    is_private INTEGER DEFAULT 0,
    is_online INTEGER DEFAULT 0,
    last_seen TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    deactivated_at TEXT
  )`);

  // Emails table
  await run(`CREATE TABLE IF NOT EXISTS emails (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    status TEXT DEFAULT 'active',
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  // Phones table
  await run(`CREATE TABLE IF NOT EXISTS phones (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    phone TEXT UNIQUE NOT NULL,
    status TEXT DEFAULT 'active',
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  // OTP codes table
  await run(`CREATE TABLE IF NOT EXISTS otp_codes (
    id TEXT PRIMARY KEY,
    identifier TEXT NOT NULL,
    code TEXT NOT NULL,
    purpose TEXT NOT NULL DEFAULT 'signup',
    expires_at INTEGER NOT NULL,
    used INTEGER DEFAULT 0,
    attempts INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  // Sessions (refresh tokens) table
  await run(`CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    refresh_token TEXT UNIQUE NOT NULL,
    expires_at INTEGER NOT NULL,
    user_agent TEXT,
    ip_address TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  // ── SOCIAL TABLES ─────────────────────────────────────────────────────────

  // Posts
  await run(`CREATE TABLE IF NOT EXISTS posts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT,
    feeling TEXT,
    location TEXT,
    privacy TEXT DEFAULT 'public',
    likes_count INTEGER DEFAULT 0,
    comments_count INTEGER DEFAULT 0,
    shares_count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`);

  // Post media (photos/videos)
  await run(`CREATE TABLE IF NOT EXISTS post_media (
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    media_url TEXT NOT NULL,
    media_type TEXT DEFAULT 'image',
    thumbnail_url TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  // Post likes
  await run(`CREATE TABLE IF NOT EXISTS post_likes (
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reaction TEXT DEFAULT 'like',
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(post_id, user_id)
  )`);

  // Comments
  await run(`CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    parent_id TEXT REFERENCES comments(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    likes_count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`);

  // Comment likes
  await run(`CREATE TABLE IF NOT EXISTS comment_likes (
    id TEXT PRIMARY KEY,
    comment_id TEXT NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(comment_id, user_id)
  )`);

  // Follows (Follower <-> Following)
  await run(`CREATE TABLE IF NOT EXISTS follows (
    id TEXT PRIMARY KEY,
    follower_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    following_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'active',
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(follower_id, following_id)
  )`);

  // Conversations (for messaging)
  await run(`CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    user1_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user2_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    last_message TEXT,
    last_message_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(user1_id, user2_id)
  )`);

  // Messages
  await run(`CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT,
    media_url TEXT,
    media_type TEXT,
    is_read INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  // Notifications
  await run(`CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    actor_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    post_id TEXT REFERENCES posts(id) ON DELETE CASCADE,
    comment_id TEXT REFERENCES comments(id) ON DELETE CASCADE,
    message TEXT,
    is_read INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  // Stories
  await run(`CREATE TABLE IF NOT EXISTS stories (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    media_url TEXT NOT NULL,
    media_type TEXT DEFAULT 'image',
    caption TEXT DEFAULT '',
    duration INTEGER DEFAULT 5,
    views_count INTEGER DEFAULT 0,
    expires_at TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  )`);
  // Add caption column if upgrading existing DB
  try { await run(`ALTER TABLE stories ADD COLUMN caption TEXT DEFAULT ''`); } catch {}

  // Story views
  await run(`CREATE TABLE IF NOT EXISTS story_views (
    id TEXT PRIMARY KEY,
    story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
    viewer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    viewed_at TEXT DEFAULT (datetime('now')),
    UNIQUE(story_id, viewer_id)
  )`);

  // Story reactions
  await run(`CREATE TABLE IF NOT EXISTS story_reactions (
    id TEXT PRIMARY KEY,
    story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reaction TEXT NOT NULL DEFAULT 'like',
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(story_id, user_id)
  )`);

  // Hashtags
  await run(`CREATE TABLE IF NOT EXISTS hashtags (
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    posts_count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  // Post ↔ Hashtag join
  await run(`CREATE TABLE IF NOT EXISTS post_hashtags (
    post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    hashtag_id TEXT NOT NULL REFERENCES hashtags(id) ON DELETE CASCADE,
    PRIMARY KEY (post_id, hashtag_id)
  )`);

  // Bookmarks / Saved Posts
  await run(`CREATE TABLE IF NOT EXISTS bookmarks (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, post_id)
  )`);

  // Post shares / reposts
  await run(`CREATE TABLE IF NOT EXISTS shares (
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(post_id, user_id)
  )`);

  // Friendships
  await run(`CREATE TABLE IF NOT EXISTS friendships (
    id TEXT PRIMARY KEY,
    requester_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    receiver_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'pending',
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(requester_id, receiver_id)
  )`);

  // Post Reactions (extended emoji support)
  await run(`CREATE TABLE IF NOT EXISTS post_reactions (
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reaction_type TEXT DEFAULT 'like',
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(post_id, user_id)
  )`);

  // Comment Reactions
  await run(`CREATE TABLE IF NOT EXISTS comment_reactions (
    id TEXT PRIMARY KEY,
    comment_id TEXT NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reaction_type TEXT DEFAULT 'like',
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(comment_id, user_id)
  )`);

  // ── INDEXES ───────────────────────────────────────────────────────────────
  await run(`CREATE INDEX IF NOT EXISTS idx_emails_user_id ON emails(user_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_phones_user_id ON phones(user_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_otp_identifier ON otp_codes(identifier)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_sessions_refresh_token ON sessions(refresh_token)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_posts_user_id ON posts(user_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_post_likes_post_id ON post_likes(post_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_post_likes_user_id ON post_likes(user_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_comments_post_id ON comments(post_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_follows_following ON follows(following_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_stories_user ON stories(user_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_bookmarks_user ON bookmarks(user_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_friendships_requester ON friendships(requester_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_friendships_receiver ON friendships(receiver_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_post_reactions_post ON post_reactions(post_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_post_reactions_user ON post_reactions(user_id)`);

  // Seed demo users and sample posts
  await seedUsers();
  await seedPosts();

  console.log('[DB] Schema ready.');
}


async function seedUsers() {
  const demoUsers = [
    { id: 'user-001', username: 'alexthompson',   email: 'alex@handbook.demo',   fullName: 'Alex Thompson',     firstName: 'Alex',    lastName: 'Thompson',  bio: 'Full-stack developer & coffee enthusiast ☕ | Building things that matter | San Francisco based 🌉', location: 'San Francisco, CA', website: 'https://alexthompson.dev' },
    { id: 'user-002', username: 'sarahchen',       email: 'sarah@handbook.demo',  fullName: 'Sarah Chen',        firstName: 'Sarah',   lastName: 'Chen',      bio: 'UX Designer @TechCorp | Creating delightful experiences ✨ | Dog mom 🐕 | She/Her', location: 'New York, NY', website: 'https://sarahchen.design' },
    { id: 'user-003', username: 'marcusjohnson',   email: 'marcus@handbook.demo', fullName: 'Marcus Johnson',    firstName: 'Marcus',  lastName: 'Johnson',   bio: 'Sports journalist | NBA & NFL analyst 🏀🏈 | Podcast host of "The Playbook" | Always courtside', location: 'Chicago, IL', website: 'https://theplaybook.fm' },
    { id: 'user-004', username: 'emmawilliams',    email: 'emma@handbook.demo',   fullName: 'Emma Williams',     firstName: 'Emma',    lastName: 'Williams',  bio: 'Travel photographer 📸 | 40+ countries and counting 🌍 | Currently in Bali 🌺 | DM for collabs', location: 'Bali, Indonesia', website: 'https://emmawilliams.photo' },
    { id: 'user-005', username: 'rajpatel',        email: 'raj@handbook.demo',    fullName: 'Raj Patel',         firstName: 'Raj',     lastName: 'Patel',     bio: 'Startup founder @NexGen AI 🚀 | Y Combinator W24 | Building the future of AI | Ex-Google', location: 'Austin, TX', website: 'https://nexgenai.co' },
    { id: 'user-006', username: 'lisaanderson',    email: 'lisa@handbook.demo',   fullName: 'Lisa Anderson',     firstName: 'Lisa',    lastName: 'Anderson',  bio: 'Fitness coach & nutritionist 💪 | Helping you become your best self | 10K+ transformations | Book: "FitLife"', location: 'Los Angeles, CA', website: 'https://fitlife-lisa.com' },
    { id: 'user-007', username: 'davidkim',        email: 'david@handbook.demo',  fullName: 'David Kim',         firstName: 'David',   lastName: 'Kim',       bio: 'Music producer & songwriter 🎵 | Grammy nominated | Working with artists worldwide | New album dropping soon', location: 'Nashville, TN', website: 'https://davidkimmusic.com' },
    { id: 'user-008', username: 'oliviamartinez',  email: 'olivia@handbook.demo', fullName: 'Olivia Martinez',   firstName: 'Olivia',  lastName: 'Martinez',  bio: 'Bestselling author 📚 | Writing about love, loss & finding yourself | "The Last Chapter" out now | She/Her', location: 'Portland, OR', website: 'https://oliviamartinezbooks.com' },
    { id: 'user-009', username: 'jameswilson',     email: 'james@handbook.demo',  fullName: 'James Wilson',      firstName: 'James',   lastName: 'Wilson',    bio: 'Chef & restaurant owner 🍳 | "Wilson\'s Kitchen" — NYC | Farm-to-table everything | Food is love', location: 'Brooklyn, NY', website: 'https://wilsonskitchen.nyc' },
    { id: 'user-010', username: 'miarodriguez',    email: 'mia@handbook.demo',    fullName: 'Mia Rodriguez',     firstName: 'Mia',     lastName: 'Rodriguez', bio: 'Environmental scientist 🌱 | Fighting climate change one research paper at a time | Surfer 🏄‍♀️ | PhD candidate', location: 'San Diego, CA', website: 'https://miarodriguez.science' },
  ];

  const passwordHash = await bcrypt.hash('demo123', 10);

  for (const u of demoUsers) {
    const existing = await get('SELECT id FROM users WHERE id = ?', [u.id]);
    if (!existing) {
      await run(
        `INSERT INTO users (id, username, full_name, first_name, last_name, avatar, bio, location, website, password_hash, is_online, last_seen, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))`,
        [u.id, u.username, u.fullName, u.firstName, u.lastName,
         `https://ui-avatars.com/api/?name=${encodeURIComponent(u.fullName)}&background=random&size=200`,
         u.bio, u.location, u.website, passwordHash]
      );
      await run(
        `INSERT INTO emails (id, user_id, email, status) VALUES (?, ?, ?, 'active')`,
        [`email-${u.id}`, u.id, u.email]
      );
      console.log(`[DB] Seeded user: ${u.fullName} (${u.email})`);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Seed demo social data: follows, posts, comments, likes, hashtags
// ─────────────────────────────────────────────────────────────────────────────
async function seedPosts() {
  const crypto = require('crypto');
  const uid = () => crypto.randomUUID();

  // Check if users already seeded - if so, do not re-seed demo posts
  const existingUsers = await get('SELECT id FROM users LIMIT 1');
  if (existingUsers) return;

  // Seed follows (everyone follows user-001, user-002, user-003)
  const followPairs = [
    ['user-002','user-001'], ['user-003','user-001'], ['user-004','user-001'],
    ['user-005','user-001'], ['user-001','user-002'], ['user-003','user-002'],
    ['user-004','user-002'], ['user-001','user-003'], ['user-002','user-003'],
    ['user-005','user-003'], ['user-001','user-004'], ['user-002','user-005'],
    ['user-006','user-001'], ['user-007','user-002'], ['user-008','user-003'],
    ['user-009','user-004'], ['user-010','user-005'],
  ];
  for (const [frid, fgid] of followPairs) {
    await run(
      `INSERT OR IGNORE INTO follows (id, follower_id, following_id) VALUES (?,?,?)`,
      [uid(), frid, fgid]
    );
  }

  // Seed hashtags
  const hashtagNames = ['technology','travel','fitness','music','food','photography','nature','art','coding','sports'];
  const hashtagIds = {};
  for (const name of hashtagNames) {
    const htId = uid();
    hashtagIds[name] = htId;
    await run(`INSERT OR IGNORE INTO hashtags (id, name) VALUES (?,?)`, [htId, name]);
  }

  // Seed posts
  const demoPosts = [
    { id:'post-001', uid:'user-001', content:"Just shipped a major feature update to our platform! 🚀 The new real-time collaboration tools are finally live. It's been 3 months of hard work but so worth it. #coding #technology", feeling:'excited', location:'San Francisco, CA', tags:['coding','technology'], likes:47, comments_count:12, ago:'-2 hours' },
    { id:'post-002', uid:'user-002', content:"The new design system we've been building at work is finally coming together ✨ Clean, accessible, and beautiful. Design is not just how it looks — it's how it works. #art #technology", feeling:'creative', location:'New York, NY', tags:['art','technology'], likes:83, comments_count:21, ago:'-4 hours' },
    { id:'post-003', uid:'user-003', content:"BREAKING: What a game last night! The fourth quarter comeback was absolutely insane 🏀 Thread on why this changes everything for the playoffs 👇 #sports", feeling:'excited', location:'Chicago, IL', tags:['sports'], likes:234, comments_count:67, ago:'-6 hours' },
    { id:'post-004', uid:'user-004', content:"Sunrise over the rice terraces in Bali this morning 🌅 There are places in this world that make you believe in magic. 📸 #travel #photography #nature", feeling:'grateful', location:'Ubud, Bali', tags:['travel','photography','nature'], likes:512, comments_count:89, ago:'-8 hours' },
    { id:'post-005', uid:'user-005', content:"We just closed our Series A! 🎉 $12M to keep building the future of AI. Thank you to everyone who believed in us from day one. The journey is just beginning. #technology", feeling:'excited', location:'Austin, TX', tags:['technology'], likes:1043, comments_count:198, ago:'-1 day' },
    { id:'post-006', uid:'user-006', content:"Morning workout done ✅ 5:30am, no excuses. Your future self will thank you. Who else is up early crushing their goals? 💪 #fitness", feeling:'motivated', location:'Los Angeles, CA', tags:['fitness'], likes:178, comments_count:43, ago:'-10 hours' },
    { id:'post-007', uid:'user-007', content:"Been in the studio all week with some incredible artists 🎵 Can't say too much yet but this album is going to be something special. Stay tuned! #music", feeling:'creative', location:'Nashville, TN', tags:['music'], likes:321, comments_count:54, ago:'-12 hours' },
    { id:'post-008', uid:'user-008', content:"Just hit 100,000 pre-orders for 'The Last Chapter'! 📚 I'm overwhelmed with gratitude. This book was my hardest to write and it means the world that people connect with it.", feeling:'grateful', tags:[], likes:892, comments_count:234, ago:'-1 day' },
    { id:'post-009', uid:'user-009', content:"Tonight's special: Pan-seared salmon with lemon butter sauce, roasted asparagus, and truffle risotto 🍳 Food is love made visible. #food", feeling:'happy', location:'Brooklyn, NY', tags:['food'], likes:445, comments_count:87, ago:'-3 hours' },
    { id:'post-010', uid:'user-010', content:"New research just published: ocean temperatures in the Pacific have risen 1.2°C over the past decade. The data doesn't lie. We need to act now. 🌊🌱 #nature #technology", feeling:'concerned', location:'San Diego, CA', tags:['nature','technology'], likes:267, comments_count:72, ago:'-5 hours' },
  ];

  for (const p of demoPosts) {
    await run(
      `INSERT INTO posts (id, user_id, content, feeling, location, privacy, likes_count, comments_count, created_at, updated_at)
       VALUES (?,?,?,?,?,'public',?,?,datetime('now',?),datetime('now',?))`,
      [p.id, p.uid, p.content, p.feeling||null, p.location||null, p.likes, p.comments_count, p.ago, p.ago]
    );

    // Link hashtags
    for (const tag of p.tags) {
      if (hashtagIds[tag]) {
        await run(`INSERT OR IGNORE INTO post_hashtags (post_id, hashtag_id) VALUES (?,?)`, [p.id, hashtagIds[tag]]);
        await run(`UPDATE hashtags SET posts_count = posts_count + 1 WHERE id = ?`, [hashtagIds[tag]]);
      }
    }
  }

  // Seed some likes (user-001 and user-002 like some posts)
  const likePairs = [
    ['user-001','post-002'],['user-001','post-003'],['user-001','post-004'],
    ['user-002','post-001'],['user-002','post-005'],['user-003','post-001'],
    ['user-003','post-007'],['user-004','post-003'],['user-005','post-002'],
  ];
  for (const [uid2, pid] of likePairs) {
    await run(
      `INSERT OR IGNORE INTO post_likes (id, post_id, user_id) VALUES (?,?,?)`,
      [uid(), pid, uid2]
    );
  }

  // Seed some comments
  const demoComments = [
    { pid:'post-001', uid:'user-002', text:'Congrats! The new collaboration feature is 🔥 Been waiting for this one.' },
    { pid:'post-001', uid:'user-005', text:'Amazing work! How did you handle the real-time sync?' },
    { pid:'post-002', uid:'user-001', text:'This design system looks incredible! Would love to learn more about your process.' },
    { pid:'post-003', uid:'user-001', text:'That comeback was legendary! I was on the edge of my seat the entire 4th quarter!' },
    { pid:'post-004', uid:'user-002', text:'This photo is breathtaking 😍 Bali is on my bucket list for sure!' },
    { pid:'post-005', uid:'user-001', text:'Congratulations! So well deserved. You guys have built something truly special.' },
    { pid:'post-006', uid:'user-003', text:'Respect! 5:30am is no joke. You inspire me to be better.' },
    { pid:'post-009', uid:'user-002', text:'That salmon dish looks absolutely divine! Do you do cooking classes? 👨‍🍳' },
  ];
  for (const c of demoComments) {
    await run(
      `INSERT INTO comments (id, post_id, user_id, content) VALUES (?,?,?,?)`,
      [uid(), c.pid, c.uid, c.text]
    );
  }

  console.log('[DB] Seeded demo posts, follows, likes, comments, hashtags.');
}

module.exports = { getDb, run, get, all, initDb };
