const sqlite3 = require('sqlite3').verbose();
const jwt = require('jsonwebtoken');
const http = require('http');

const db = new sqlite3.Database('./handbook.db');
db.get("SELECT * FROM users LIMIT 1", (err, user) => {
  if (err || !user) return console.log('DB Error:', err);
  
  const token = jwt.sign(
    { sub: user.id, username: user.username },
    'supersecretkeyhandbook2026',
    { expiresIn: '1h' }
  );

  const body = JSON.stringify({
    mediaUrl: 'data:image/png;base64,iVBORw0K',
    mediaType: 'image',
    caption: 'test caption'
  });

  const req = http.request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/stories',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
      'Authorization': 'Bearer ' + token
    }
  }, res => {
    let data = '';
    res.on('data', c => data += c);
    res.on('end', () => console.log('Status:', res.statusCode, data));
  });

  req.on('error', e => console.error(e));
  req.write(body);
  req.end();
});
