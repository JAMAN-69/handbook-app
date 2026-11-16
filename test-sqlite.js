const fs = require('fs');
// Let's just generate a 100KB string and see if sqlite can save it!
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./handbook.db');

const mediaUrl = 'data:image/jpeg;base64,' + 'A'.repeat(150000); // 150KB base64
db.run(
  `INSERT INTO stories (id, user_id, media_url, media_type, caption, duration, expires_at, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
  ['test-huge', 'user-001', mediaUrl, 'image', 'test', 5, '2026-07-28T17:48:44.307Z'],
  function(err) {
    if (err) console.error('SQLITE ERROR:', err.message);
    else console.log('SUCCESS! Saved 150KB.');
  }
);
