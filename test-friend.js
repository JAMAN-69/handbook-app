const sqlite3 = require('sqlite3').verbose();
const jwt = require('jsonwebtoken');

const db = new sqlite3.Database('./handbook.db');

// Get two users - one who sent request, one who will accept
db.get("SELECT * FROM users WHERE id = 'user-001'", async (err, user1) => {
  db.get("SELECT * FROM users WHERE id = 'user-002'", async (err2, user2) => {
    if (!user1 || !user2) { console.log('Users not found'); return; }

    // Token for user2 (the receiver who will accept)
    const token = jwt.sign(
      { sub: user2.id, username: user2.username },
      'supersecretkeyhandbook2026',
      { expiresIn: '1h' }
    );

    // First, create a pending friend request from user1 to user2
    const crypto = require('crypto');
    db.run(
      `DELETE FROM friendships WHERE (requester_id='user-001' AND receiver_id='user-002') OR (requester_id='user-002' AND receiver_id='user-001')`,
      async () => {
        db.run(
          `INSERT INTO friendships (id, requester_id, receiver_id, status) VALUES (?, ?, ?, 'pending')`,
          [crypto.randomUUID(), 'user-001', 'user-002'],
          async (err) => {
            if (err) { console.log('Insert error:', err.message); return; }
            console.log('Created pending friend request from user-001 to user-002');

            // Now test accepting via API
            const http = require('http');
            const body = JSON.stringify({});
            const options = {
              hostname: 'localhost',
              port: 5000,
              path: '/api/friends/confirm/user-001',
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
                'Content-Length': Buffer.byteLength(body)
              }
            };

            const req = http.request(options, (res) => {
              let data = '';
              res.on('data', (chunk) => data += chunk);
              res.on('end', () => {
                console.log('Status:', res.statusCode);
                console.log('Response:', data);
                db.close();
              });
            });
            req.on('error', (e) => console.error('Request error:', e));
            req.write(body);
            req.end();
          }
        );
      }
    );
  });
});
