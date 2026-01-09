#!/usr/bin/env node

// Forzza WebSocket Inspector
// This will help us understand how Forzza handles real-time updates

const WebSocket = require('ws');

async function inspectForzza() {
  console.log('🔍 Inspecting Forzza WebSocket implementation...');
  
  // Common WebSocket endpoints for betting sites
  const possibleEndpoints = [
    'wss://sportsbook.forzza1x2.com/ws',
    'wss://api.forzza1x2.com/ws',
    'wss://live.forzza1x2.com/ws',
    'wss://socket.forzza1x2.com/ws',
    'wss://eu-swarm-newm.vmemkhhgjigrjefb.com', // Your current endpoint
  ];
  
  for (const endpoint of possibleEndpoints) {
    try {
      console.log(`\n🔌 Trying: ${endpoint}`);
      
      const ws = new WebSocket(endpoint, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Origin': 'https://sportsbook.forzza1x2.com'
        }
      });
      
      ws.on('open', () => {
        console.log(`✅ Connected to ${endpoint}`);
        
        // Try common subscription patterns
        const subscriptions = [
          { command: 'subscribe', channel: 'odds' },
          { command: 'subscribe', channel: 'live' },
          { command: 'subscribe', params: { sport: 'football' } },
          { action: 'subscribe', type: 'odds' },
          { type: 'subscribe', data: { channel: 'live_odds' } }
        ];
        
        subscriptions.forEach((sub, i) => {
          setTimeout(() => {
            console.log(`📤 Sending subscription ${i + 1}:`, JSON.stringify(sub));
            ws.send(JSON.stringify(sub));
          }, i * 1000);
        });
      });
      
      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          console.log(`📥 Message from ${endpoint}:`, JSON.stringify(message, null, 2));
          
          // Look for odds-related messages
          if (message.type === 'odds' || message.event === 'odds' || message.data?.odds) {
            console.log('🎯 ODDS UPDATE DETECTED!');
          }
          
          // Look for game-related messages
          if (message.type === 'game' || message.event === 'game' || message.data?.game) {
            console.log('🏈 GAME UPDATE DETECTED!');
          }
          
        } catch (e) {
          console.log(`📥 Raw message from ${endpoint}:`, data.toString());
        }
      });
      
      ws.on('error', (error) => {
        console.log(`❌ Error on ${endpoint}:`, error.message);
      });
      
      ws.on('close', () => {
        console.log(`🔌 Disconnected from ${endpoint}`);
      });
      
      // Keep connection alive for 10 seconds
      setTimeout(() => {
        ws.close();
      }, 10000);
      
      // Wait before trying next endpoint
      await new Promise(resolve => setTimeout(resolve, 12000));
      
    } catch (error) {
      console.log(`❌ Failed to connect to ${endpoint}:`, error.message);
    }
  }
  
  console.log('\n🏁 Inspection complete');
}

// Also check your current implementation
async function checkYourImplementation() {
  console.log('\n🔍 Checking your current WebSocket implementation...');
  
  try {
    const ws = new WebSocket('wss://eu-swarm-newm.vmemkhhgjigrjefb.com');
    
    ws.on('open', () => {
      console.log('✅ Connected to your Swarm endpoint');
      
      // Send session request like your app does
      const sessionRequest = {
        command: 'request_session',
        params: { partner_id: 1777 },
        rid: 'test-' + Date.now()
      };
      
      console.log('📤 Sending session request:', JSON.stringify(sessionRequest));
      ws.send(JSON.stringify(sessionRequest));
    });
    
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        console.log('📥 Swarm message:', JSON.stringify(message, null, 2));
        
        if (message.session_id) {
          console.log('🔑 Got session ID:', message.session_id);
          
          // Try subscribing to live football
          const liveSubscription = {
            command: 'request_subscribe',
            params: {
              what: { sport: 1, type: 1 }, // Football, Live
              where: { sport: 1 }
            },
            rid: 'sub-' + Date.now()
          };
          
          console.log('📤 Sending live subscription:', JSON.stringify(liveSubscription));
          ws.send(JSON.stringify(liveSubscription));
        }
        
      } catch (e) {
        console.log('📥 Raw Swarm message:', data.toString());
      }
    });
    
    ws.on('error', (error) => {
      console.log('❌ Swarm error:', error.message);
    });
    
    setTimeout(() => {
      ws.close();
    }, 15000);
    
  } catch (error) {
    console.log('❌ Failed to connect to Swarm:', error.message);
  }
}

async function main() {
  await inspectForzza();
  await checkYourImplementation();
}

if (require.main === module) {
  main().catch(console.error);
}
