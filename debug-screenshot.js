const puppeteer = require('puppeteer');
const sqlite3 = require('sqlite3').verbose();
const jwt = require('jsonwebtoken');
const path = require('path');

const db = new sqlite3.Database('./handbook.db');

db.get("SELECT * FROM users WHERE id = 'user-001'", async (err, user) => {
  if (err || !user) {
    console.log('DB Error or no user:', err);
    return;
  }
  console.log('Found user:', user.id, user.username);

  const token = jwt.sign(
    { sub: user.id, username: user.username },
    'supersecretkeyhandbook2026',
    { expiresIn: '1h' }
  );

  const browser = await puppeteer.launch({ headless: "new", args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  // Log console messages
  page.on('console', msg => {
    if (!msg.text().includes('[Store]')) {
      console.log('BROWSER:', msg.text());
    }
  });

  try {
    // Step 1: Go to root and set auth
    await page.goto('http://localhost:5000/', { waitUntil: 'networkidle2' });
    
    await page.evaluate((t, u) => {
      localStorage.setItem('hb_access_token', t);
      localStorage.setItem('handbook_session', JSON.stringify({
        id: u.id,
        username: u.username,
        fullName: u.full_name,
        firstName: u.first_name,
        lastName: u.last_name,
        avatar: u.avatar,
        email: u.email
      }));
    }, token, user);

    // Step 2: Hard reload into #feed
    await page.goto('http://localhost:5000/#feed', { waitUntil: 'networkidle2' });

    // Debug: take screenshot immediately
    const screenshotPath = 'C:\\Users\\AC\\.gemini\\antigravity\\brain\\299d67b6-9acf-40b7-9d7e-38d8d088d99d\\debug1.png';
    await page.screenshot({ path: screenshotPath, fullPage: false });
    console.log('Screenshot1 saved at: debug1.png');

    // Debug: check what elements exist
    const bodyText = await page.evaluate(() => {
      return {
        hash: window.location.hash,
        hasStoryCard: !!document.querySelector('.fb-story-card--create'),
        hasLoginPage: !!document.querySelector('#auth-page, .auth-container'),
        appContainerHtml: document.querySelector('#app-container')?.innerHTML?.slice(0, 500) || 'not found'
      };
    });
    console.log('Body info:', JSON.stringify(bodyText, null, 2));

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await browser.close();
  }
});
