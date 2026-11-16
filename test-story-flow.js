const puppeteer = require('puppeteer');
const sqlite3 = require('sqlite3').verbose();
const jwt = require('jsonwebtoken');

const db = new sqlite3.Database('./handbook.db');

db.get("SELECT * FROM users WHERE id = 'user-001'", async (err, user) => {
  if (err || !user) { console.log('DB Error:', err); return; }
  console.log('User:', user.id, user.username);

  const token = jwt.sign(
    { sub: user.id, username: user.username },
    'supersecretkeyhandbook2026',
    { expiresIn: '1h' }
  );

  const browser = await puppeteer.launch({ headless: "new", args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  const errors = [];
  page.on('console', msg => {
    const t = msg.text();
    if (!t.includes('[Store]')) console.log('BROWSER:', t);
  });
  page.on('response', async response => {
    const url = response.url();
    if (url.includes('/api/stories') && !response.ok()) {
      const body = await response.text().catch(() => '');
      errors.push({ url, status: response.status(), body });
      console.log('API ERROR:', response.status(), url, body);
    }
    if (url.includes('/api/stories') && response.ok()) {
      const body = await response.text().catch(() => '');
      console.log('API SUCCESS:', response.status(), url, body.slice(0, 200));
    }
  });

  try {
    // Navigate and set auth
    await page.goto('http://localhost:5000/');
    await page.evaluate((t, u) => {
      localStorage.setItem('hb_access_token', t);
      localStorage.setItem('handbook_session', JSON.stringify({
        id: u.id, username: u.username, fullName: u.full_name,
        firstName: u.first_name, lastName: u.last_name,
        avatar: u.avatar, email: u.email
      }));
    }, token, user);
    await page.goto('http://localhost:5000/#feed', { waitUntil: 'networkidle2' });

    // Click Create Story
    console.log('Clicking Create Story...');
    await page.waitForSelector('.fb-story-card--create', { timeout: 10000 });
    await page.click('.fb-story-card--create');

    // Wait for modal
    console.log('Waiting for story modal...');
    await page.waitForSelector('#story-creator-overlay', { timeout: 5000 });

    // Screenshot of modal
    await page.screenshot({ path: 'C:\\Users\\AC\\.gemini\\antigravity\\brain\\299d67b6-9acf-40b7-9d7e-38d8d088d99d\\step1_modal.png' });
    console.log('Screenshot: step1_modal.png');

    // Find and click text story option
    const textCard = await page.$('#choice-text');
    if (textCard) {
      console.log('Clicking #choice-text...');
      await textCard.click();
    } else {
      console.log('No #choice-text! Looking at modal HTML...');
      const modalHtml = await page.evaluate(() => document.querySelector('#story-creator-overlay')?.innerHTML?.slice(0, 1000));
      console.log('Modal HTML:', modalHtml);
    }

    // Wait for text editor
    console.log('Waiting for text editor...');
    await page.waitForSelector('#se-text-content', { timeout: 5000 });
    await page.type('#se-text-content', 'AI test: Story upload works!');

    // Screenshot of text editor
    await page.screenshot({ path: 'C:\\Users\\AC\\.gemini\\antigravity\\brain\\299d67b6-9acf-40b7-9d7e-38d8d088d99d\\step2_editor.png' });
    console.log('Screenshot: step2_editor.png');

    // Click share button
    console.log('Clicking Share...');
    await page.click('#se-share-btn');

    // Wait for modal to close
    await page.waitForFunction(() => !document.querySelector('#story-creator-overlay'), { timeout: 10000 });
    console.log('Modal closed! Story uploaded successfully!');
    
    // Wait a bit and screenshot
    await new Promise(r => setTimeout(r, 2000));
    await page.screenshot({ path: 'C:\\Users\\AC\\.gemini\\antigravity\\brain\\299d67b6-9acf-40b7-9d7e-38d8d088d99d\\step3_success.png' });
    console.log('Screenshot: step3_success.png');

  } catch (err) {
    console.error('FAILED:', err.message);
    await page.screenshot({ path: 'C:\\Users\\AC\\.gemini\\antigravity\\brain\\299d67b6-9acf-40b7-9d7e-38d8d088d99d\\error_state.png' });
    console.log('Error screenshot saved!');
  } finally {
    await browser.close();
  }
});
