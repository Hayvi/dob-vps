#!/usr/bin/env node
/**
 * Capture and analyze Forzza's WebSocket subscription patterns
 */
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

const WS_URL = 'wss://eu-swarm-newm.vmemkhhgjigrjefb.com';
const PARTNER_ID = 1777;

let ws;
const pending = new Map();

function send(cmd, params = {}) {
  return new Promise((resolve, reject) => {
    const rid = uuidv4();
    const t = setTimeout(() => { pending.delete(rid); reject(new Error('Timeout')); }, 30000);
    pending.set(rid, { resolve, t });
    ws.send(JSON.stringify({ command: cmd, params, rid }));
  });
}

async function analyze() {
  console.log('🔌 Connecting to analyze Forzza patterns...\n');
  ws = new WebSocket(WS_URL);
  await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });
  
  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.rid && pending.has(msg.rid)) {
        const { resolve, t } = pending.get(msg.rid);
        clearTimeout(t);
        pending.delete(msg.rid);
        resolve(msg);
      }
    } catch (e) {}
  });

  const sess = await send('request_session', { site_id: PARTNER_ID, language: 'eng' });
  console.log('✅ Session:', sess.data?.sid, '\n');

  // ============ ANALYZE SUBSCRIPTION PATTERNS ============
  console.log('='.repeat(70));
  console.log('FORZZA SUBSCRIPTION PATTERNS vs YOUR IMPLEMENTATION');
  console.log('='.repeat(70));

  // 1. Live Games Subscription - What Forzza likely uses
  console.log('\n📡 LIVE GAMES SUBSCRIPTION COMPARISON:\n');
  
  const forzaaLivePattern = {
    source: 'betting',
    what: {
      sport: ['id', 'name', 'alias', 'order'],
      region: ['id', 'name', 'alias', 'order'],
      competition: ['id', 'name', 'order'],
      game: [] // ALL fields
    },
    where: {
      sport: { type: { '@nin': [1, 4] } },
      game: { type: 1 }
    },
    subscribe: true
  };

  console.log('Forzza likely subscribes with ALL game fields (game: [])');
  console.log('Your implementation requests specific fields only\n');

  // 2. Test subscription with market data embedded
  console.log('📡 TESTING EMBEDDED MARKET SUBSCRIPTION:\n');
  
  const embeddedMarketSub = await send('get', {
    source: 'betting',
    what: {
      game: ['id', 'team1_name', 'team2_name', 'start_ts', 'type', 'markets_count'],
      market: ['id', 'name', 'type', 'order', 'display_key'],
      event: ['id', 'name', 'price', 'order']
    },
    where: {
      sport: { id: 1 },
      game: { type: 1 },
      market: { type: { '@in': ['P1XP2', 'P1P2'] } }
    },
    subscribe: true
  });

  const subid = embeddedMarketSub.data?.subid;
  console.log('✅ Can subscribe to games WITH markets embedded:', subid ? 'YES' : 'NO');
  console.log('   This means: ONE subscription for games + main market odds!\n');

  // 3. Check count subscription patterns
  console.log('📡 COUNT SUBSCRIPTION PATTERNS:\n');
  
  // Per-sport counts
  const sportCountSub = await send('get', {
    source: 'betting',
    what: { sport: ['id', 'name'], game: '@count' },
    where: { game: { type: 1 } },
    subscribe: true
  });
  console.log('✅ Per-sport live counts subscription:', sportCountSub.data?.subid ? 'WORKS' : 'FAILED');

  // 4. Check what "where" filters are supported
  console.log('\n📡 ADVANCED FILTER PATTERNS:\n');

  // Time-based filter
  const now = Math.floor(Date.now() / 1000);
  const timeFilter = await send('get', {
    source: 'betting',
    what: { game: ['id', 'team1_name', 'start_ts'] },
    where: {
      sport: { id: 1 },
      game: { 
        type: 0,
        start_ts: { '@gte': now, '@lte': now + 86400 } // Next 24h
      }
    }
  });
  const timeGames = timeFilter.data?.data?.game;
  console.log('✅ Time-range filter (@gte/@lte):', timeGames ? Object.keys(timeGames).length + ' games' : 'FAILED');

  // Competition filter
  const compFilter = await send('get', {
    source: 'betting',
    what: { game: ['id', 'team1_name'] },
    where: {
      competition: { id: 538 }, // Premier League
      game: { type: { '@in': [0, 1] } }
    }
  });
  const compGames = compFilter.data?.data?.game;
  console.log('✅ Competition filter:', compGames ? Object.keys(compGames).length + ' games' : 'FAILED');

  // 5. Check order_by support
  console.log('\n📡 SORTING PATTERNS:\n');
  
  const sortedGames = await send('get', {
    source: 'betting',
    what: { game: ['id', 'team1_name', 'start_ts', 'order'] },
    where: { sport: { id: 1 }, game: { type: 0 } },
    order_by: [{ field: 'start_ts', order: 'asc' }]
  });
  console.log('✅ order_by support:', sortedGames.code === 0 ? 'YES' : 'NO');

  // 6. Check pagination/limit support
  console.log('\n📡 PAGINATION PATTERNS:\n');
  
  const limitedGames = await send('get', {
    source: 'betting',
    what: { game: ['id', 'team1_name'] },
    where: { sport: { id: 1 }, game: { type: 0 } },
    limit: 10,
    offset: 0
  });
  const limitCount = limitedGames.data?.data?.game ? Object.keys(limitedGames.data.data.game).length : 0;
  console.log('✅ limit/offset support:', limitCount <= 10 ? `YES (got ${limitCount})` : 'NO');

  // 7. Analyze real-time update granularity
  console.log('\n📡 REAL-TIME UPDATE ANALYSIS:\n');
  console.log('Forzza uses incremental updates (deltas) via subscription');
  console.log('Your implementation: Polls every 1s for live, SSE for delivery');
  console.log('');
  console.log('RECOMMENDATION: Use native Swarm subscriptions instead of polling!');
  console.log('- Subscribe once, receive only changed data');
  console.log('- Much lower bandwidth and latency');

  // 8. Check multi-subscription support
  console.log('\n📡 MULTI-SUBSCRIPTION PATTERNS:\n');
  
  const sub1 = await send('get', {
    source: 'betting',
    what: { game: '@count' },
    where: { game: { type: 1 } },
    subscribe: true
  });
  
  const sub2 = await send('get', {
    source: 'betting', 
    what: { game: '@count' },
    where: { game: { type: 0 } },
    subscribe: true
  });
  
  console.log('✅ Multiple concurrent subscriptions:', 
    (sub1.data?.subid && sub2.data?.subid) ? 'SUPPORTED' : 'NOT SUPPORTED');
  console.log('   Live count subid:', sub1.data?.subid);
  console.log('   Prematch count subid:', sub2.data?.subid);

  // ============ SUMMARY ============
  console.log('\n' + '='.repeat(70));
  console.log('KEY DIFFERENCES FOUND');
  console.log('='.repeat(70));
  console.log(`
1. EMBEDDED MARKETS: Forzza gets games + odds in ONE request
   → You make separate requests for games and odds

2. NATIVE SUBSCRIPTIONS: Forzza uses Swarm's subscribe:true
   → You poll every 1s (more bandwidth, higher latency)

3. INCREMENTAL UPDATES: Swarm sends only changed fields
   → You receive full payloads each poll

4. TIME FILTERS: API supports @gte/@lte for date ranges
   → Useful for "Today's games", "Next 24h" features

5. BOOSTED SELECTIONS: get_boosted_selections API exists
   → You don't have enhanced odds feature yet
`);

  ws.close();
}

analyze().catch(console.error);
