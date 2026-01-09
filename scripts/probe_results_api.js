/**
 * Probe script to discover if Swarm API has a results/history endpoint
 * Run with: node scripts/probe_results_api.js
 */

const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

const WS_URL = 'wss://eu-swarm-newm.vmemkhhgjigrjefb.com';
const PARTNER_ID = 1777;

let ws = null;
let sessionId = null;
const pendingRequests = new Map();

function connect() {
  return new Promise((resolve, reject) => {
    ws = new WebSocket(WS_URL);
    
    ws.on('open', async () => {
      console.log('✓ WebSocket connected');
      try {
        const session = await sendRequest('request_session', {
          site_id: PARTNER_ID,
          language: 'eng'
        });
        sessionId = session?.data?.sid;
        console.log('✓ Session established:', sessionId);
        resolve();
      } catch (e) {
        reject(e);
      }
    });

    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.rid && pendingRequests.has(msg.rid)) {
        const { resolve, timeout } = pendingRequests.get(msg.rid);
        clearTimeout(timeout);
        pendingRequests.delete(msg.rid);
        resolve(msg);
      }
    });

    ws.on('error', reject);
  });
}

function sendRequest(command, params = {}, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const rid = uuidv4();
    const timeout = setTimeout(() => {
      pendingRequests.delete(rid);
      reject(new Error(`Timeout: ${command}`));
    }, timeoutMs);

    pendingRequests.set(rid, { resolve, reject, timeout });
    ws.send(JSON.stringify({ command, params, rid }));
  });
}

async function probe(label, params) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`PROBE: ${label}`);
  console.log('Params:', JSON.stringify(params, null, 2));
  console.log('-'.repeat(60));
  
  try {
    const result = await sendRequest('get', params);
    const hasData = result?.data && Object.keys(result.data).length > 0;
    const code = result?.code;
    
    if (code !== undefined && code !== 0) {
      console.log(`✗ Error code ${code}: ${result?.msg || 'unknown'}`);
    } else if (hasData) {
      console.log('✓ GOT DATA!');
      console.log('Keys:', Object.keys(result.data));
      // Show sample of what we got
      const sample = JSON.stringify(result.data, null, 2).slice(0, 1000);
      console.log('Sample:', sample + (sample.length >= 1000 ? '...' : ''));
    } else {
      console.log('✗ Empty response');
    }
    return result;
  } catch (e) {
    console.log(`✗ ${e.message}`);
    return null;
  }
}

async function run() {
  console.log('Probing Swarm API for results/history endpoints...\n');
  
  await connect();

  // Calculate date range (today)
  const now = Math.floor(Date.now() / 1000);
  const todayStart = now - (now % 86400);
  const yesterdayStart = todayStart - 86400;

  // 1. Try different source values
  const sources = ['results', 'result', 'history', 'settled', 'finished', 'archive', 'sport_results'];
  
  for (const source of sources) {
    await probe(`source: "${source}"`, {
      source,
      what: { sport: [], game: [] },
      where: { sport: { id: 1 } }
    });
  }

  // 2. Try game types beyond 0,1,2
  console.log('\n\n>>> Testing different game types with source: "betting"');
  
  for (const type of [3, 4, 5, -1, 99]) {
    await probe(`game.type = ${type}`, {
      source: 'betting',
      what: { game: ['id', 'team1_name', 'team2_name', 'start_ts', 'type'] },
      where: { sport: { id: 1 }, game: { type } }
    });
  }

  // 3. Try querying past games by start_ts
  console.log('\n\n>>> Testing past games by timestamp');
  
  await probe('games with start_ts < now (past games)', {
    source: 'betting',
    what: { game: ['id', 'team1_name', 'team2_name', 'start_ts', 'type', 'is_started'] },
    where: { 
      sport: { id: 1 }, 
      game: { start_ts: { '@lt': now } }
    }
  });

  await probe('games from yesterday', {
    source: 'betting',
    what: { game: ['id', 'team1_name', 'team2_name', 'start_ts', 'type'] },
    where: { 
      sport: { id: 1 }, 
      game: { 
        start_ts: { '@gte': yesterdayStart, '@lt': todayStart }
      }
    }
  });

  // 4. Try "get_result" command instead of "get"
  console.log('\n\n>>> Testing alternative commands');
  
  for (const cmd of ['get_results', 'get_result', 'results', 'get_history']) {
    console.log(`\nTrying command: "${cmd}"`);
    try {
      const result = await sendRequest(cmd, {
        sport_id: 1,
        from_date: yesterdayStart,
        to_date: now
      });
      console.log('Response:', JSON.stringify(result, null, 2).slice(0, 500));
    } catch (e) {
      console.log(`✗ ${e.message}`);
    }
  }

  // 5. Try different "what" structures that might reveal results
  console.log('\n\n>>> Testing different data structures');

  await probe('request ALL game fields (empty array)', {
    source: 'betting',
    what: { game: [] },
    where: { sport: { id: 1 }, game: { type: 1 } }
  });

  await probe('request "result" field explicitly', {
    source: 'betting', 
    what: { game: ['id', 'team1_name', 'team2_name', 'result', 'score', 'final_score', 'winner'] },
    where: { sport: { id: 1 }, game: { type: 1 } }
  });

  // 6. Check if there's a sport_result or match_result entity
  await probe('sport_result entity', {
    source: 'betting',
    what: { sport_result: [] },
    where: { sport: { id: 1 } }
  });

  await probe('match_result entity', {
    source: 'betting',
    what: { match_result: [] },
    where: { sport: { id: 1 } }
  });

  console.log('\n\n' + '='.repeat(60));
  console.log('PROBE COMPLETE');
  console.log('='.repeat(60));
  
  ws.close();
}

run().catch(console.error);
