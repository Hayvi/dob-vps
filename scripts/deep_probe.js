#!/usr/bin/env node
/**
 * Deep probe of Swarm API - find ALL available data
 */
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

const WS_URL = 'wss://eu-swarm-newm.vmemkhhgjigrjefb.com';
const PARTNER_ID = 1777;

let ws, sessionId;
const pending = new Map();

function send(cmd, params = {}, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const rid = uuidv4();
    const t = setTimeout(() => { pending.delete(rid); reject(new Error('Timeout')); }, timeout);
    pending.set(rid, { resolve, reject, t });
    ws.send(JSON.stringify({ command: cmd, params, rid }));
  });
}

async function probe() {
  console.log('🔌 Connecting...\n');
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
  sessionId = sess.data?.sid;
  console.log('✅ Session:', sessionId, '\n');

  // ============ PROBE ALL SOURCES ============
  console.log('='.repeat(60));
  console.log('PROBING DATA SOURCES');
  console.log('='.repeat(60));
  
  const sources = ['betting', 'casino', 'live_casino', 'virtual', 'pool_betting', 'esports', 'statistics'];
  for (const source of sources) {
    try {
      const res = await send('get', { source, what: { sport: ['id', 'name'] } }, 5000);
      const count = res.data?.data?.sport ? Object.keys(res.data.data.sport).length : 0;
      console.log(`${count > 0 ? '✅' : '❌'} ${source}: ${count} sports`);
    } catch (e) {
      console.log(`❌ ${source}: ${e.message}`);
    }
  }

  // ============ PROBE COMPETITION FIELDS ============
  console.log('\n' + '='.repeat(60));
  console.log('ALL COMPETITION FIELDS');
  console.log('='.repeat(60));
  
  const compRes = await send('get', {
    source: 'betting',
    what: { competition: [] },
    where: { sport: { id: 1 } }
  });
  const comps = compRes.data?.data?.competition;
  if (comps) {
    const sample = Object.values(comps)[0];
    console.log('Sample competition:', JSON.stringify(sample, null, 2));
  }

  // ============ PROBE REGION FIELDS ============
  console.log('\n' + '='.repeat(60));
  console.log('ALL REGION FIELDS');
  console.log('='.repeat(60));
  
  const regRes = await send('get', {
    source: 'betting',
    what: { region: [] },
    where: { sport: { id: 1 } }
  });
  const regions = regRes.data?.data?.region;
  if (regions) {
    const sample = Object.values(regions)[0];
    console.log('Sample region:', JSON.stringify(sample, null, 2));
  }

  // ============ PROBE SPORT FIELDS ============
  console.log('\n' + '='.repeat(60));
  console.log('ALL SPORT FIELDS');
  console.log('='.repeat(60));
  
  const sportRes = await send('get', {
    source: 'betting',
    what: { sport: [] },
    where: { sport: { id: 1 } }
  });
  const sports = sportRes.data?.data?.sport;
  if (sports) {
    const sample = Object.values(sports)[0];
    console.log('Sample sport:', JSON.stringify(sample, null, 2));
  }

  // ============ PROBE ADDITIONAL COMMANDS ============
  console.log('\n' + '='.repeat(60));
  console.log('PROBING MORE COMMANDS');
  console.log('='.repeat(60));
  
  const moreCommands = [
    { cmd: 'get_partner_config', params: {} },
    { cmd: 'get_translations', params: { language: 'eng' } },
    { cmd: 'get_currencies', params: {} },
    { cmd: 'get_bonus_types', params: {} },
    { cmd: 'get_bet_types', params: {} },
    { cmd: 'get_market_types', params: {} },
    { cmd: 'get_event_types', params: {} },
    { cmd: 'get_sport_types', params: {} },
    { cmd: 'get_regions', params: { sport_id: 1 } },
    { cmd: 'get_competitions', params: { sport_id: 1, region_id: 1 } },
    { cmd: 'get_popular_games', params: {} },
    { cmd: 'get_featured_games', params: {} },
    { cmd: 'get_top_games', params: {} },
    { cmd: 'get_live_calendar', params: {} },
    { cmd: 'get_prematch_calendar', params: {} },
    { cmd: 'get_boosted_selections', params: {} },
    { cmd: 'get_super_bets', params: {} },
    { cmd: 'get_combo_boost', params: {} },
  ];

  for (const { cmd, params } of moreCommands) {
    try {
      const res = await send(cmd, params, 5000);
      const code = res.code ?? res.data?.code;
      if (code === 0 || code === undefined) {
        const keys = res.data ? Object.keys(res.data).slice(0, 5) : [];
        console.log(`✅ ${cmd}:`, keys.length ? keys.join(', ') : 'OK');
      } else {
        console.log(`❌ ${cmd}: code ${code}`);
      }
    } catch (e) {
      console.log(`⏱️ ${cmd}: timeout`);
    }
  }

  // ============ PROBE GAME WITH ALL POSSIBLE FIELDS ============
  console.log('\n' + '='.repeat(60));
  console.log('CHECKING FOR NEW GAME FIELDS');
  console.log('='.repeat(60));
  
  const gameRes = await send('get', {
    source: 'betting',
    what: { game: [] },
    where: { game: { type: 1 } }
  });
  const games = gameRes.data?.data?.game;
  if (games) {
    const sample = Object.values(games)[0];
    const currentFields = [
      'id', 'team1_name', 'team2_name', 'team1_id', 'team2_id', 'start_ts',
      'markets_count', 'info', 'stats', 'score1', 'score2', 'text_info',
      'live_events', 'is_live', 'is_started', 'type', 'game_number', 'match_length',
      'strong_team', 'round', 'region_alias', 'last_event', 'live_available',
      'promoted', 'is_neutral_venue', 'season_id', 'is_blocked', 'sport_alias',
      'show_type', 'is_stat_available'
    ];
    
    const allFields = Object.keys(sample);
    const newFields = allFields.filter(f => !currentFields.includes(f));
    
    console.log('\n🆕 NEW GAME FIELDS NOT YET CAPTURED:');
    newFields.forEach(f => {
      const val = sample[f];
      const type = Array.isArray(val) ? 'array' : typeof val;
      const preview = JSON.stringify(val)?.slice(0, 50);
      console.log(`  - ${f}: ${type} = ${preview}`);
    });
  }

  // ============ PROBE MARKET WITH ALL FIELDS ============
  console.log('\n' + '='.repeat(60));
  console.log('CHECKING FOR NEW MARKET FIELDS');
  console.log('='.repeat(60));
  
  const marketRes = await send('get', {
    source: 'betting',
    what: { market: [], event: [] },
    where: { game: { type: 1 } }
  });
  const markets = marketRes.data?.data?.market;
  if (markets) {
    const sample = Object.values(markets)[0];
    const currentMarketFields = [
      'id', 'name', 'type', 'order', 'col_count', 'display_key', 'is_blocked',
      'cashout', 'available_for_betbuilder', 'group_id', 'group_name', 'display_color'
    ];
    
    const allFields = Object.keys(sample).filter(k => k !== 'event');
    const newFields = allFields.filter(f => !currentMarketFields.includes(f));
    
    console.log('\n🆕 NEW MARKET FIELDS NOT YET CAPTURED:');
    newFields.forEach(f => {
      const val = sample[f];
      const type = Array.isArray(val) ? 'array' : typeof val;
      const preview = JSON.stringify(val)?.slice(0, 50);
      console.log(`  - ${f}: ${type} = ${preview}`);
    });

    // Check event fields
    if (sample.event) {
      const eventSample = Object.values(sample.event)[0];
      const currentEventFields = [
        'id', 'name', 'price', 'order', 'type', 'base', 'is_blocked',
        'home_value', 'away_value', 'type_id'
      ];
      const allEventFields = Object.keys(eventSample);
      const newEventFields = allEventFields.filter(f => !currentEventFields.includes(f));
      
      console.log('\n🆕 NEW EVENT FIELDS NOT YET CAPTURED:');
      newEventFields.forEach(f => {
        const val = eventSample[f];
        const type = Array.isArray(val) ? 'array' : typeof val;
        const preview = JSON.stringify(val)?.slice(0, 50);
        console.log(`  - ${f}: ${type} = ${preview}`);
      });
    }
  }

  ws.close();
}

probe().catch(console.error);
