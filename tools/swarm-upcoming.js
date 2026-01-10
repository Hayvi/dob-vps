/**
 * Explore upcoming/scheduled matches in Swarm API
 */
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

const WS_URL = 'wss://eu-swarm-newm.vmemkhhgjigrjefb.com';
const SITE_ID = 1777;

let ws;
const pending = new Map();

function send(command, params = {}) {
  const rid = uuidv4();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pending.delete(rid);
      reject(new Error(`Timeout: ${command}`));
    }, 15000);
    pending.set(rid, { resolve, reject, timeout });
    ws.send(JSON.stringify({ command, params, rid }));
  });
}

async function explore() {
  ws = new WebSocket(WS_URL, { perMessageDeflate: true });
  
  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    if (msg.rid && pending.has(msg.rid)) {
      const { resolve, timeout } = pending.get(msg.rid);
      clearTimeout(timeout);
      pending.delete(msg.rid);
      resolve(msg);
    }
  });

  await new Promise(r => ws.on('open', r));
  
  const sess = await send('request_session', { site_id: SITE_ID, language: 'eng' });
  console.log('Session:', sess.data?.sid);

  // 1. Check upcoming/calendar commands
  console.log('\n========== UPCOMING MATCHES COMMANDS ==========\n');
  
  const upcomingCmds = [
    { cmd: 'get_live_calendar', params: {} },
    { cmd: 'get_upcoming_events', params: {} },
    { cmd: 'get_scheduled_events', params: {} },
    { cmd: 'get_next_events', params: {} },
    { cmd: 'get_starting_soon', params: {} },
    { cmd: 'get_highlights', params: {} },
    { cmd: 'get_featured', params: {} },
    { cmd: 'get_top_matches', params: {} },
  ];
  
  for (const { cmd, params } of upcomingCmds) {
    try {
      const res = await send(cmd, params);
      if (res.code === 0 && res.data) {
        console.log(`✅ ${cmd}:`, JSON.stringify(res.data).slice(0, 300));
      }
    } catch (e) {
      // timeout
    }
  }

  // 2. Query prematch games starting soon (next 2 hours)
  console.log('\n========== PREMATCH STARTING SOON (next 2h) ==========\n');
  
  const now = Math.floor(Date.now() / 1000);
  const in2Hours = now + (2 * 60 * 60);
  
  // Try with @now operator like Forzza
  const soonRes = await send('get', {
    source: 'betting',
    what: {
      sport: ['id', 'name'],
      region: ['id', 'name'],
      competition: ['id', 'name'],
      game: ['id', 'team1_name', 'team2_name', 'start_ts', 'type']
    },
    where: {
      sport: { type: { '@nin': [1, 4] } },
      game: {
        type: { '@in': [0, 2] },
        start_ts: { '@now': { '@gte': 0, '@lte': 7200 } }  // within 2 hours from now
      }
    }
  });
  
  let count = 0;
  const sData = soonRes.data?.data;
  const sportCounts = {};
  if (sData?.sport) {
    for (const sport of Object.values(sData.sport)) {
      let sportCount = 0;
      for (const region of Object.values(sport?.region || {})) {
        for (const comp of Object.values(region?.competition || {})) {
          for (const game of Object.values(comp?.game || {})) {
            count++;
            sportCount++;
            if (count <= 5) {
              const startTime = new Date(game.start_ts * 1000).toLocaleTimeString();
              console.log(`[${sport.name}] ${game.team1_name} vs ${game.team2_name} @ ${startTime}`);
            }
          }
        }
      }
      if (sportCount > 0) sportCounts[sport.name] = sportCount;
    }
  }
  console.log(`\nTotal games starting in next 2h: ${count}`);
  console.log('By sport:', sportCounts);

  // 3. Query by date range (tomorrow)
  console.log('\n========== TOMORROW\'S MATCHES ==========\n');
  
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  const tomorrowStart = Math.floor(tomorrow.getTime() / 1000);
  const tomorrowEnd = tomorrowStart + 86400;
  
  const tomorrowRes = await send('get', {
    source: 'betting',
    what: {
      sport: ['id', 'name'],
      game: ['id', 'team1_name', 'team2_name', 'start_ts']
    },
    where: {
      sport: { id: 1 },
      game: {
        type: 0,
        start_ts: { '@gte': tomorrowStart, '@lte': tomorrowEnd }
      }
    }
  });
  
  let tCount = 0;
  const tData = tomorrowRes.data?.data;
  if (tData?.sport) {
    for (const sport of Object.values(tData.sport)) {
      for (const region of Object.values(sport?.region || {})) {
        for (const comp of Object.values(region?.competition || {})) {
          tCount += Object.keys(comp?.game || {}).length;
        }
      }
    }
  }
  console.log(`Total football matches tomorrow: ${tCount}`);

  // 4. Check "starting_soon" filter that Forzza might use
  console.log('\n========== FORZZA UPCOMING FILTER ==========\n');
  
  const forzaUpcoming = await send('get', {
    source: 'betting',
    what: {
      sport: ['id', 'name', 'alias'],
      region: ['id', 'name'],
      competition: ['id', 'name'],
      game: ['id', 'team1_name', 'team2_name', 'start_ts', 'type', 'is_live']
    },
    where: {
      game: {
        type: { '@in': [0, 2] },
        '@or': [
          { start_ts: { '@now': { '@gte': 0, '@lte': 7200 } } },  // starts within 2h
          { is_live: 0, start_ts: { '@gte': now, '@lte': now + 7200 } }
        ]
      }
    }
  });
  
  console.log('Response code:', forzaUpcoming.code);
  if (forzaUpcoming.code === 0) {
    let upCount = 0;
    const uData = forzaUpcoming.data?.data;
    if (uData?.sport) {
      for (const sport of Object.values(uData.sport)) {
        for (const region of Object.values(sport?.region || {})) {
          for (const comp of Object.values(region?.competition || {})) {
            upCount += Object.keys(comp?.game || {}).length;
          }
        }
      }
    }
    console.log(`Games starting within 2h: ${upCount}`);
  }

  ws.close();
  console.log('\nDone!');
}

explore().catch(console.error);
