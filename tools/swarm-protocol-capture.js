/**
 * Swarm Protocol Capture Tool
 * Connects to Forzza's Swarm API and logs raw protocol messages
 */
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

const WS_URL = 'wss://eu-swarm-newm.vmemkhhgjigrjefb.com';
const SITE_ID = 1777;

let ws;
let sessionId;
const pending = new Map();

function log(type, data) {
  const ts = new Date().toISOString();
  console.log(`\n[${ts}] === ${type} ===`);
  console.log(JSON.stringify(data, null, 2));
}

function send(command, params = {}) {
  const rid = uuidv4();
  const msg = { command, params, rid };
  
  log('SEND', msg);
  
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pending.delete(rid);
      reject(new Error(`Timeout: ${command}`));
    }, 30000);
    
    pending.set(rid, { resolve, reject, timeout });
    ws.send(JSON.stringify(msg));
  });
}

async function captureProtocol() {
  console.log('Connecting to:', WS_URL);
  
  ws = new WebSocket(WS_URL, { perMessageDeflate: true });
  
  ws.on('open', async () => {
    console.log('\n✅ WebSocket connected\n');
    
    try {
      // 1. Request session
      const sessionRes = await send('request_session', {
        site_id: SITE_ID,
        language: 'eng'
      });
      sessionId = sessionRes.data?.sid;
      console.log('\n✅ Session ID:', sessionId);
      
      // 2. Subscribe to live count (like Forzza does)
      console.log('\n--- LIVE COUNT SUBSCRIPTION ---');
      await send('get', {
        source: 'betting',
        what: { game: '@count' },
        where: {
          sport: { type: { '@nin': [1, 4] } },
          game: { type: 1 }
        },
        subscribe: true
      });
      
      // 3. Subscribe to prematch count
      console.log('\n--- PREMATCH COUNT SUBSCRIPTION ---');
      await send('get', {
        source: 'betting',
        what: { game: '@count' },
        where: {
          sport: { type: { '@nin': [1, 4] } },
          game: {
            '@or': [
              { visible_in_prematch: 1 },
              { type: { '@in': [0, 2] } }
            ]
          }
        },
        subscribe: true
      });
      
      // 4. Subscribe to live games for Football (sport 1)
      console.log('\n--- LIVE GAMES SUBSCRIPTION (Football) ---');
      await send('get', {
        source: 'betting',
        what: {
          sport: ['id', 'name', 'alias'],
          region: ['id', 'name', 'alias'],
          competition: ['id', 'name'],
          game: ['id', 'team1_name', 'team2_name', 'start_ts', 'score1', 'score2', 'info', 'is_blocked', 'markets_count']
        },
        where: {
          sport: { id: 1 },
          game: { type: 1 }
        },
        subscribe: true
      });
      
      // 5. Get a game ID from live games, then subscribe to its markets
      console.log('\n--- FETCHING A LIVE GAME FOR MARKET SUBSCRIPTION ---');
      const liveGamesRes = await send('get', {
        source: 'betting',
        what: { game: ['id'] },
        where: {
          sport: { id: 1 },
          game: { type: 1 }
        }
      });
      
      const gameData = liveGamesRes.data?.data;
      let sampleGameId = null;
      
      // Extract first game ID from nested structure
      if (gameData?.sport) {
        for (const sport of Object.values(gameData.sport)) {
          if (sport?.region) {
            for (const region of Object.values(sport.region)) {
              if (region?.competition) {
                for (const comp of Object.values(region.competition)) {
                  if (comp?.game) {
                    sampleGameId = Object.keys(comp.game)[0];
                    break;
                  }
                }
              }
              if (sampleGameId) break;
            }
          }
          if (sampleGameId) break;
        }
      }
      
      if (sampleGameId) {
        console.log('\n--- GAME MARKETS SUBSCRIPTION (Game:', sampleGameId, ') ---');
        const marketsRes = await send('get', {
          source: 'betting',
          what: {
            market: ['id', 'name', 'type', 'order', 'col_count', 'is_blocked'],
            event: ['id', 'name', 'price', 'order', 'base', 'is_blocked']
          },
          where: {
            game: { id: parseInt(sampleGameId) }
          },
          subscribe: true
        });
        
        // Show a sample of the markets data structure
        const marketsData = marketsRes.data?.data?.market;
        if (marketsData) {
          const marketIds = Object.keys(marketsData).slice(0, 2);
          console.log('\n--- SAMPLE MARKET STRUCTURE ---');
          for (const mid of marketIds) {
            console.log(JSON.stringify({ [mid]: marketsData[mid] }, null, 2));
          }
        }
      }
      
      console.log('\n\n========================================');
      console.log('Listening for subscription updates...');
      console.log('Press Ctrl+C to exit');
      console.log('========================================\n');
      
    } catch (err) {
      console.error('Error:', err.message);
    }
  });
  
  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      
      // Handle request responses
      if (msg.rid && pending.has(msg.rid)) {
        const { resolve, timeout } = pending.get(msg.rid);
        clearTimeout(timeout);
        pending.delete(msg.rid);
        log('RECV (response)', msg);
        resolve(msg);
        return;
      }
      
      // Handle subscription updates (rid=0)
      if (msg.rid === 0 || msg.rid === '0') {
        log('RECV (subscription update)', msg);
        return;
      }
      
      log('RECV (other)', msg);
    } catch (e) {
      console.error('Parse error:', e.message);
    }
  });
  
  ws.on('error', (err) => console.error('WS Error:', err.message));
  ws.on('close', () => console.log('\nWebSocket closed'));
}

captureProtocol();
