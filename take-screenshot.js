const puppeteer = require('puppeteer');
const sqlite3 = require('sqlite3').verbose();
const jwt = require('jsonwebtoken');

const db = new sqlite3.Database('./handbook.db');

db.get("SELECT * FROM users LIMIT 1", (err, user) => {
  if (err || !user) return console.log('DB Error:', err);
  
  const token = jwt.sign(
    { sub: user.id, username: user.username },
    'supersecretkeyhandbook2026',
    { expiresIn: '1h' }
  );

  (async () => {
    const browser = await puppeteer.launch({ headless: "new", args: ['--no-sandbox'] });
    const page = await browser.newPage();
    
    // Set a good viewport size
    await page.setViewport({ width: 1280, height: 800 });

    try {
      console.log('Setting tokens and user data...');
      await page.goto('http://localhost:5000/');
      await page.evaluate((t, u) => {
        localStorage.setItem('hb_access_token', t);
        localStorage.setItem('hb_current_user', JSON.stringify({
          id: u.id,
          username: u.username,
          fullName: u.full_name,
          firstName: u.first_name,
          lastName: u.last_name,
          avatar: u.avatar
        }));
      }, token, user);
      
      console.log('Reloading page to apply store...');
      await page.reload({ waitUntil: 'networkidle2' });
      
      console.log('Reloading feed...');
      await page.goto('http://localhost:5000/#feed', { waitUntil: 'networkidle2' });
      
      console.log('Waiting for story bar...');
      await page.waitForSelector('.fb-story-card--create', { timeout: 10000 });
      
      console.log('Clicking create story...');
      await page.click('.fb-story-card--create');
      
      console.log('Waiting for modal...');
      await page.waitForSelector('#story-creator-overlay', { timeout: 5000 });
      
      console.log('Clicking Text Story option...');
      await page.evaluate(() => {
        document.querySelector('#story-creator-overlay .card:nth-child(2)').click();
      });
      
      console.log('Waiting for text editor...');
      await page.waitForSelector('#se-text-content', { timeout: 5000 });
      
      console.log('Typing text...');
      await page.type('#se-text-content', 'Hello from the AI! The story upload works perfectly!');
      
      console.log('Clicking share...');
      await page.click('#se-share-btn');
      
      console.log('Waiting for modal to close...');
      await page.waitForFunction(() => {
        return !document.querySelector('#story-creator-overlay');
      }, { timeout: 10000 });
      
      console.log('Story uploaded successfully! Taking screenshot...');
      
      // Wait a little bit for the DOM to fully update the blue ring and story bar
      await new Promise(r => setTimeout(r, 1000));
      
      // Save screenshot to artifacts folder
      await page.screenshot({ path: '../brain/299d67b6-9acf-40b7-9d7e-38d8d088d99d/success_proof.png' });
      
      console.log('Screenshot saved to success_proof.png!');
    } catch (err) {
      console.error('Error during test:', err);
    } finally {
      await browser.close();
    }
  })();
});
