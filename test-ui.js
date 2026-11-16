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
    
    // Capture console logs
    page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
    
    // Capture failed network requests
    page.on('requestfailed', request => {
      console.log('REQUEST FAILED:', request.url(), request.failure().errorText);
    });
    page.on('response', response => {
      if (!response.ok()) {
        console.log('RESPONSE NOT OK:', response.url(), response.status());
        response.text().then(text => console.log('RESPONSE BODY:', text)).catch(() => {});
      }
    });

    try {
      console.log('Setting token...');
      await page.goto('http://localhost:5000/');
      await page.evaluate((t) => {
        localStorage.setItem('hb_access_token', t);
      }, token);
      
      console.log('Reloading feed...');
      await page.goto('http://localhost:5000/#feed', { waitUntil: 'networkidle2' });
      
      console.log('Waiting for story bar...');
      await page.waitForSelector('.fb-story-card--create');
      
      console.log('Clicking create story...');
      await page.click('.fb-story-card--create');
      
      console.log('Waiting for modal...');
      await page.waitForSelector('#story-creator-overlay', { timeout: 5000 });
      
      console.log('Clicking Text Story option...');
      // It's a div with text "Create a text story". Let's use XPath or query.
      await page.evaluate(() => {
        document.querySelector('#story-creator-overlay .card:nth-child(2)').click();
      });
      
      console.log('Waiting for text editor...');
      await page.waitForSelector('#se-text-content', { timeout: 5000 });
      
      console.log('Typing text...');
      await page.type('#se-text-content', 'Test story from Puppeteer!');
      
      console.log('Clicking share...');
      await page.click('#se-share-btn');
      
      // Wait for success toast
      await page.waitForFunction(() => {
        const toast = document.querySelector('.toast');
        return toast && toast.innerText.includes('Story shared successfully');
      }, { timeout: 5000 });
      
      console.log('Story upload successful!');
    } catch (err) {
      console.error('Error during test:', err);
    } finally {
      await browser.close();
    }
  })();
});
