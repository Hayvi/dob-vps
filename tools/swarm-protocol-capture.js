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

function send(command, params = {}, silent = false) {
  const rid = uuidv4();
  const msg = { command, params, rid };
  
  if (!silent) log('SEND', msg);
  
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pending.delete(rid);
      reject(new Error(`Timeout: ${command}`));
    }, 30000);
    
    pending.set(rid, { resolve, reject, timeout, silent });
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
      
      // 5. Explore ALL available commands
      console.log('\n\n========== EXPLORING AVAILABLE API COMMANDS ==========\n');
      
      // Try various commands to see what's available
      const commandsToTry = [
        { cmd: 'get_sports', params: {} },
        { cmd: 'get_boosted_selections', params: {} },
        { cmd: 'get_max_bet', params: {} },
        { cmd: 'get_partner_config', params: {} },
        { cmd: 'get_currencies', params: {} },
        { cmd: 'get_translations', params: { language: 'eng' } },
        { cmd: 'get_promotions', params: {} },
        { cmd: 'get_banners', params: {} },
        { cmd: 'get_jackpots', params: {} },
        { cmd: 'get_favorites', params: {} },
        { cmd: 'get_popular_events', params: {} },
        { cmd: 'get_top_events', params: {} },
        { cmd: 'get_featured_events', params: {} },
        { cmd: 'get_live_calendar', params: {} },
        { cmd: 'get_sport_menu', params: {} },
        { cmd: 'get_combo_bets', params: {} },
        { cmd: 'get_super_bets', params: {} },
        { cmd: 'get_express_bets', params: {} },
        { cmd: 'get_multibet_offers', params: {} },
        { cmd: 'get_bet_builder', params: {} },
      ];
      
      for (const { cmd, params } of commandsToTry) {
        try {
          const res = await send(cmd, params, true);
          if (res.code === 0 && res.data) {
            console.log(`\n✅ ${cmd}:`);
            const preview = JSON.stringify(res.data).slice(0, 500);
            console.log(preview + (preview.length >= 500 ? '...' : ''));
          }
        } catch (e) {
          // skip timeouts
        }
      }

      // 6. Explore game fields we might be missing
      console.log('\n\n========== EXPLORING GAME FIELDS ==========\n');
      
      const allGameFieldsRes = await send('get', {
        source: 'betting',
        what: { game: [] }, // empty array = all fields
        where: {
          sport: { id: 1 },
          game: { type: 1 }
        }
      }, true);
      
      // Extract one game and show all its fields
      const gData = allGameFieldsRes.data?.data || allGameFieldsRes.data;
      if (gData?.sport) {
        for (const sport of Object.values(gData.sport)) {
          if (sport?.region) {
            for (const region of Object.values(sport.region)) {
              if (region?.competition) {
                for (const comp of Object.values(region.competition)) {
                  if (comp?.game) {
                    const gameId = Object.keys(comp.game)[0];
                    const game = comp.game[gameId];
                    console.log('ALL GAME FIELDS for game', gameId + ':');
                    console.log(JSON.stringify(Object.keys(game).sort(), null, 2));
                    console.log('\nFull game object:');
                    console.log(JSON.stringify(game, null, 2));
                    break;
                  }
                }
                break;
              }
            }
            break;
          }
        }
      }

      // 7. Explore market fields
      console.log('\n\n========== EXPLORING MARKET/EVENT FIELDS ==========\n');
      
      const liveGamesRes2 = await send('get', {
        source: 'betting',
        what: { game: ['id'] },
        where: { sport: { id: 1 }, game: { type: 1 } }
      }, true);
      
      let sampleGameId2 = null;
      const lgData = liveGamesRes2.data?.data || liveGamesRes2.data;
      if (lgData?.sport) {
        outer: for (const sport of Object.values(lgData.sport)) {
          if (sport?.region) {
            for (const region of Object.values(sport.region)) {
              if (region?.competition) {
                for (const comp of Object.values(region.competition)) {
                  if (comp?.game) {
                    sampleGameId2 = Object.keys(comp.game)[0];
                    break outer;
                  }
                }
              }
            }
          }
        }
      }
      
      if (sampleGameId2) {
        const allMarketsRes = await send('get', {
          source: 'betting',
          what: {
            market: [], // all fields
            event: []   // all fields
          },
          where: { game: { id: parseInt(sampleGameId2) } }
        }, true);
        
        const mData = allMarketsRes.data?.data || allMarketsRes.data;
        if (mData?.market) {
          const marketId = Object.keys(mData.market)[0];
          const market = mData.market[marketId];
          console.log('ALL MARKET FIELDS:');
          console.log(JSON.stringify(Object.keys(market).sort(), null, 2));
          
          if (market?.event) {
            const eventId = Object.keys(market.event)[0];
            const event = market.event[eventId];
            console.log('\nALL EVENT FIELDS:');
            console.log(JSON.stringify(Object.keys(event).sort(), null, 2));
            console.log('\nSample event:');
            console.log(JSON.stringify(event, null, 2));
          }
        }
      }

      // 8. Check for special data sources
      console.log('\n\n========== EXPLORING DATA SOURCES ==========\n');
      
      const sources = ['betting', 'casino', 'poker', 'financials', 'esports', 'virtual_sports'];
      for (const source of sources) {
        try {
          const res = await send('get', {
            source,
            what: { sport: ['id', 'name'] }
          }, true);
          if (res.code === 0 && res.data) {
            const d = res.data?.data || res.data;
            const count = d?.sport ? Object.keys(d.sport).length : 0;
            if (count > 0) {
              console.log(`✅ Source "${source}": ${count} sports`);
            }
          }
        } catch (e) {}
      }

      console.log('\n\n========================================');
      console.log('Exploration complete!');
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
        const { resolve, timeout, silent } = pending.get(msg.rid);
        clearTimeout(timeout);
        pending.delete(msg.rid);
        if (!silent) log('RECV (response)', msg);
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
