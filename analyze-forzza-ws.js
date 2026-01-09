#!/usr/bin/env node

// WebSocket traffic analyzer for Forzza
// Usage: node analyze-forzza-ws.js

const puppeteer = require('puppeteer');

async function analyzeForzza() {
  console.log('🔍 Launching browser to analyze Forzza WebSocket traffic...');
  
  const browser = await puppeteer.launch({
    headless: false,
    devtools: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  
  // Track WebSocket connections
  const wsConnections = [];
  const wsMessages = [];
  
  // Intercept WebSocket creation
  await page.evaluateOnNewDocument(() => {
    const OriginalWebSocket = window.WebSocket;
    window.WebSocket = function(url, protocols) {
      console.log('📡 New WebSocket:', url);
      const ws = new OriginalWebSocket(url, protocols);
      
      const originalSend = ws.send;
      ws.send = function(data) {
        console.log('📤 WS Send:', data);
        return originalSend.call(this, data);
      };
      
      ws.addEventListener('message', function(event) {
        console.log('📥 WS Message:', event.data);
        
        try {
          const parsed = JSON.parse(event.data);
          if (parsed.type === 'odds' || parsed.event === 'odds' || parsed.data?.odds) {
            console.log('🎯 ODDS UPDATE:', parsed);
          }
        } catch (e) {}
      });
      
      return ws;
    };
  });
  
  // Monitor network for WebSocket upgrades
  await page.setRequestInterception(true);
  page.on('request', request => {
    if (request.headers()['upgrade'] === 'websocket') {
      console.log('🔌 WebSocket handshake:', request.url());
      wsConnections.push(request.url());
    }
    request.continue();
  });
  
  try {
    console.log('🌐 Navigating to Forzza...');
    await page.goto('https://sportsbook.forzza1x2.com', { waitUntil: 'networkidle2' });
    
    console.log('⚽ Looking for live football games...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Try to click on Live tab
    try {
      await page.click('[data-testid="live-tab"], .live-tab');
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (e) {
      console.log('Could not find Live tab, continuing...');
    }
    
    // Try to click on a game
    try {
      const gameSelector = '.game-row, .match-row, [data-testid="game"], .event-row';
      await page.waitForSelector(gameSelector, { timeout: 5000 });
      await page.click(gameSelector);
      console.log('🎮 Clicked on a game');
      await new Promise(resolve => setTimeout(resolve, 3000));
    } catch (e) {
      console.log('Could not find/click game:', e.message);
    }
    
    console.log('📊 Analysis Results:');
    console.log('WebSocket connections found:', wsConnections.length);
    wsConnections.forEach((url, i) => {
      console.log(`  ${i + 1}. ${url}`);
    });
    
    // Keep browser open for manual inspection
    console.log('🔍 Browser kept open for manual inspection. Check DevTools Network tab for WebSocket traffic.');
    console.log('Press Ctrl+C to close when done.');
    
    // Wait indefinitely
    await new Promise(() => {});
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await browser.close();
  }
}

if (require.main === module) {
  analyzeForzza().catch(console.error);
}
