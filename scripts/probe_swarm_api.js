#!/usr/bin/env node
/**
 * Probe Swarm WebSocket API to discover all available commands and data
 */

const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

const WS_URL = 'wss://eu-swarm-newm.vmemkhhgjigrjefb.com';
const PARTNER_ID = 1777;

let ws;
let sessionId;
const pendingRequests = new Map();

function send(command, params = {}) {
  return new Promise((resolve, reject) => {
    const rid = uuidv4();
    const timeout = setTimeout(() => {
      pendingRequests.delete(rid);
      reject(new Error(`Timeout: ${command}`));
    }, 30000);
    
    pendingRequests.set(rid, { resolve, reject, timeout });
    ws.send(JSON.stringify({ command, params, rid }));
  });
}

async function probe() {
  console.log('🔌 Connecting to Swarm WebSocket...\n');
  
  ws = new WebSocket(WS_URL);
  
  await new Promise((resolve, reject) => {
    ws.on('open', resolve);
    ws.on('error', reject);
  });
  
  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.rid && pendingRequests.has(msg.rid)) {
        const { resolve, timeout } = pendingRequests.get(msg.rid);
        clearTimeout(timeout);
        pendingRequests.delete(msg.rid);
        resolve(msg);
      }
    } catch (e) {}
  });
  
  // Get session
  const sessionRes = await send('request_session', { site_id: PARTNER_ID, language: 'eng' });
  sessionId = sessionRes.data?.sid;
  console.log('✅ Session:', sessionId, '\n');
  
  // ============ PROBE AVAILABLE COMMANDS ============
  console.log('=' .repeat(60));
  console.log('PROBING SWARM API COMMANDS');
  console.log('=' .repeat(60));
  
  const commands = [
    // Standard commands
    { cmd: 'get', params: { source: 'betting', what: { sport: ['id', 'name'] } } },
    { cmd: 'get_sports', params: {} },
    { cmd: 'get_sport_list', params: {} },
    { cmd: 'get_regions', params: { sport_id: 1 } },
    { cmd: 'get_competitions', params: { sport_id: 1 } },
    { cmd: 'get_games', params: { sport_id: 1 } },
    { cmd: 'get_live_games', params: {} },
    { cmd: 'get_prematch_games', params: {} },
    
    // Results/History
    { cmd: 'get_results', params: { game_id: '1' } },
    { cmd: 'get_result_games', params: { sport_id: 1, from_date: Math.floor(Date.now()/1000) - 86400, to_date: Math.floor(Date.now()/1000), is_date_ts: 1 } },
    { cmd: 'get_active_competitions', params: { from_date: Math.floor(Date.now()/1000) - 86400, to_date: Math.floor(Date.now()/1000) } },
    { cmd: 'get_history', params: {} },
    { cmd: 'get_game_history', params: { game_id: 1 } },
    
    // Betting features
    { cmd: 'get_cashout', params: {} },
    { cmd: 'get_cashout_amount', params: { bet_id: 1 } },
    { cmd: 'get_bet_history', params: {} },
    { cmd: 'get_open_bets', params: {} },
    { cmd: 'get_betslip', params: {} },
    { cmd: 'calculate_bet', params: {} },
    { cmd: 'place_bet', params: {} },
    
    // User/Account
    { cmd: 'get_user', params: {} },
    { cmd: 'get_balance', params: {} },
    { cmd: 'get_profile', params: {} },
    { cmd: 'get_bonuses', params: {} },
    { cmd: 'get_promotions', params: {} },
    
    // Streaming/Live
    { cmd: 'get_stream_url', params: { game_id: 1 } },
    { cmd: 'get_video_url', params: { game_id: 1 } },
    { cmd: 'get_live_stream', params: {} },
    { cmd: 'get_tracker', params: { game_id: 1 } },
    { cmd: 'get_statistics', params: { game_id: 1 } },
    { cmd: 'get_match_stats', params: { game_id: 1 } },
    
    // Odds/Markets
    { cmd: 'get_odds', params: { game_id: 1 } },
    { cmd: 'get_markets', params: { game_id: 1 } },
    { cmd: 'get_boosted_odds', params: {} },
    { cmd: 'get_enhanced_odds', params: {} },
    { cmd: 'get_specials', params: {} },
    { cmd: 'get_popular', params: {} },
    { cmd: 'get_favorites', params: {} },
    
    // Config/Meta
    { cmd: 'get_config', params: {} },
    { cmd: 'get_settings', params: {} },
    { cmd: 'get_translations', params: { language: 'eng' } },
    { cmd: 'get_currencies', params: {} },
    { cmd: 'get_countries', params: {} },
    { cmd: 'get_languages', params: {} },
    { cmd: 'get_time', params: {} },
    { cmd: 'ping', params: {} },
    
    // Subscription
    { cmd: 'subscribe', params: { what: { game: '@count' }, where: { game: { type: 1 } } } },
    { cmd: 'unsubscribe', params: { subid: 'test' } },
  ];
  
  const results = { working: [], notWorking: [], needsAuth: [] };
  
  for (const { cmd, params } of commands) {
    try {
      const res = await send(cmd, params);
      const code = res.code ?? res.data?.code;
      const msg = res.msg ?? res.data?.msg ?? '';
      
      if (code === 0 || code === undefined) {
        results.working.push({ cmd, hasData: !!res.data, keys: res.data ? Object.keys(res.data).slice(0, 5) : [] });
        console.log(`✅ ${cmd}: OK`, res.data ? `(keys: ${Object.keys(res.data).slice(0,5).join(', ')})` : '');
      } else if (msg.toLowerCase().includes('auth') || msg.toLowerCase().includes('login') || code === 12) {
        results.needsAuth.push({ cmd, code, msg });
        console.log(`🔐 ${cmd}: Needs auth (${code}: ${msg})`);
      } else {
        results.notWorking.push({ cmd, code, msg });
        console.log(`❌ ${cmd}: ${code} - ${msg}`);
      }
    } catch (e) {
      results.notWorking.push({ cmd, error: e.message });
      console.log(`⏱️ ${cmd}: ${e.message}`);
    }
  }
  
  // ============ PROBE GAME FIELDS ============
  console.log('\n' + '=' .repeat(60));
  console.log('PROBING ALL AVAILABLE GAME FIELDS');
  console.log('=' .repeat(60));
  
  // Get a live game to inspect all fields
  const liveGamesRes = await send('get', {
    source: 'betting',
    what: {
      sport: [],
      region: [],
      competition: [],
      game: []  // Empty array = all fields
    },
    where: {
      game: { type: 1 }  // Live games
    }
  });
  
  const liveData = liveGamesRes.data?.data || liveGamesRes.data;
  let sampleGame = null;
  
  if (liveData?.sport) {
    for (const sport of Object.values(liveData.sport)) {
      if (sport.region) {
        for (const region of Object.values(sport.region)) {
          if (region.competition) {
            for (const comp of Object.values(region.competition)) {
              if (comp.game) {
                sampleGame = Object.values(comp.game)[0];
                break;
              }
            }
          }
          if (sampleGame) break;
        }
      }
      if (sampleGame) break;
    }
  }
  
  if (sampleGame) {
    console.log('\n📊 ALL GAME FIELDS AVAILABLE:');
    console.log(JSON.stringify(sampleGame, null, 2));
    
    console.log('\n📋 FIELD LIST:');
    Object.keys(sampleGame).sort().forEach(k => {
      const v = sampleGame[k];
      const type = Array.isArray(v) ? 'array' : typeof v;
      console.log(`  - ${k}: ${type}`);
    });
  }
  
  // ============ PROBE MARKET FIELDS ============
  console.log('\n' + '=' .repeat(60));
  console.log('PROBING ALL AVAILABLE MARKET/EVENT FIELDS');
  console.log('=' .repeat(60));
  
  if (sampleGame) {
    const marketsRes = await send('get', {
      source: 'betting',
      what: {
        market: [],  // All fields
        event: []    // All fields
      },
      where: {
        game: { id: sampleGame.id }
      }
    });
    
    const marketData = marketsRes.data?.data || marketsRes.data;
    if (marketData?.market) {
      const sampleMarket = Object.values(marketData.market)[0];
      console.log('\n📊 SAMPLE MARKET FIELDS:');
      console.log(JSON.stringify(sampleMarket, null, 2));
      
      if (sampleMarket?.event) {
        const sampleEvent = Object.values(sampleMarket.event)[0];
        console.log('\n📊 SAMPLE EVENT FIELDS:');
        console.log(JSON.stringify(sampleEvent, null, 2));
      }
    }
  }
  
  // ============ PROBE SPECIAL FEATURES ============
  console.log('\n' + '=' .repeat(60));
  console.log('PROBING SPECIAL FEATURES');
  console.log('=' .repeat(60));
  
  // Check for boosted/enhanced odds
  const boostedRes = await send('get', {
    source: 'betting',
    what: {
      sport: ['id', 'name'],
      game: ['id', 'team1_name', 'team2_name', 'is_boosted', 'boosted_odds', 'promoted', 'featured']
    },
    where: {
      game: { '@or': [{ is_boosted: 1 }, { promoted: 1 }, { featured: 1 }] }
    }
  });
  console.log('\n🚀 Boosted/Featured games:', JSON.stringify(boostedRes.data, null, 2).slice(0, 500));
  
  // Check for outright/futures
  const outrightRes = await send('get', {
    source: 'betting',
    what: {
      sport: ['id', 'name'],
      game: ['id', 'team1_name', 'team2_name', 'type', 'is_outright']
    },
    where: {
      game: { type: 2 }  // Outright
    }
  });
  console.log('\n🏆 Outright/Futures:', JSON.stringify(outrightRes.data, null, 2).slice(0, 500));
  
  // ============ SUMMARY ============
  console.log('\n' + '=' .repeat(60));
  console.log('SUMMARY');
  console.log('=' .repeat(60));
  console.log(`\n✅ Working commands (${results.working.length}):`, results.working.map(r => r.cmd).join(', '));
  console.log(`\n🔐 Needs authentication (${results.needsAuth.length}):`, results.needsAuth.map(r => r.cmd).join(', '));
  console.log(`\n❌ Not working/unknown (${results.notWorking.length}):`, results.notWorking.map(r => r.cmd).join(', '));
  
  ws.close();
}

probe().catch(console.error);
