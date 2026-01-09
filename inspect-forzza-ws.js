// Run this in Forzza's browser console to inspect their WebSocket traffic
// Go to: https://sportsbook.forzza1x2.com/en/sports/live/event-view/Soccer/Brazil/14808/sao-paulo-junior-cup/28775685/ec-xv-de-jau-u-corinthians-sp-u

(function() {
  console.log('🔍 Inspecting Forzza WebSocket traffic...');
  
  // Hook into WebSocket constructor
  const OriginalWebSocket = window.WebSocket;
  const sockets = [];
  
  window.WebSocket = function(url, protocols) {
    console.log('📡 New WebSocket connection:', url);
    const ws = new OriginalWebSocket(url, protocols);
    sockets.push(ws);
    
    const originalSend = ws.send;
    ws.send = function(data) {
      console.log('📤 WS Send:', data);
      return originalSend.call(this, data);
    };
    
    ws.addEventListener('message', function(event) {
      console.log('📥 WS Message:', event.data);
      
      // Try to parse JSON
      try {
        const parsed = JSON.parse(event.data);
        if (parsed.type === 'odds' || parsed.event === 'odds') {
          console.log('🎯 Odds update detected:', parsed);
        }
        if (parsed.type === 'game' || parsed.event === 'game') {
          console.log('🏈 Game update detected:', parsed);
        }
      } catch (e) {
        // Not JSON, that's fine
      }
    });
    
    ws.addEventListener('open', function() {
      console.log('✅ WebSocket opened:', url);
    });
    
    ws.addEventListener('close', function() {
      console.log('❌ WebSocket closed:', url);
    });
    
    return ws;
  };
  
  // Also check for existing WebSocket connections
  setTimeout(() => {
    console.log('📊 Active WebSocket connections:', sockets.length);
    sockets.forEach((ws, i) => {
      console.log(`Socket ${i}:`, ws.url, 'State:', ws.readyState);
    });
  }, 2000);
  
  // Monitor for 30 seconds
  setTimeout(() => {
    console.log('🏁 WebSocket inspection complete');
  }, 30000);
})();
