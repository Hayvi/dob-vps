/**
 * Explore ALL available fields and commands in Swarm API
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
  
  // Get session
  const sess = await send('request_session', { site_id: SITE_ID, language: 'eng' });
  console.log('Session:', sess.data?.sid);

  // 1. Get ALL game fields - use specific fields list to see what's available
  console.log('\n\n========== ALL GAME FIELDS ==========\n');
  
  // First get with known fields to find a game
  const gamesRes = await send('get', {
    source: 'betting',
    what: { 
      sport: ['id'],
      region: ['id'],
      competition: ['id'],
      game: ['id', 'team1_name', 'team2_name', 'start_ts', 'type', 'is_blocked', 'markets_count', 
             'info', 'stats', 'score1', 'score2', 'text_info', 'live_events',
             'is_live', 'is_started', 'game_number', 'match_length', 'sport_alias',
             'strong_team', 'round', 'region_alias', 'last_event', 'live_available', 
             'promoted', 'is_neutral_venue', 'season_id', 'scout_provider', 
             'visible_in_prematch', 'not_in_sportsbook', 'is_reversed', 
             'team1_reg', 'team2_reg', 'team1_reg_name', 'team2_reg_name', 
             'add_info_name', 'favorite_order', 'show_type', 'is_stat_available',
             'tv_type', 'video_id', 'video_id2', 'video_id3', 'video_provider',
             'is_cashout_available', 'express_id', 'team1_external_id', 'team2_external_id',
             'game_external_id', 'competition_external_id', 'region_external_id',
             'sport_external_id', 'is_betbuilder_available', 'betbuilder_id',
             'stream_info', 'has_stream', 'stream_url', 'stream_type',
             'is_super_bet', 'super_bet_id', 'is_combo_bet', 'combo_bet_id',
             'is_express', 'express_min_count', 'express_max_count',
             'team1_logo', 'team2_logo', 'competition_logo', 'sport_logo',
             'weather', 'venue', 'referee', 'attendance',
             'home_score', 'away_score', 'period', 'minute', 'second',
             'set_scores', 'game_scores', 'period_scores',
             'red_cards', 'yellow_cards', 'corners', 'penalties',
             'possession', 'shots', 'shots_on_target', 'fouls',
             'offsides', 'free_kicks', 'goal_kicks', 'throw_ins',
             'injuries', 'substitutions', 'var_decisions'
            ]
    },
    where: { sport: { id: 1 }, game: { type: 1 } }
  });
  
  const gData = gamesRes.data?.data;
  let sampleGame = null;
  let gameId = null;
  if (gData?.sport) {
    for (const sport of Object.values(gData.sport)) {
      for (const region of Object.values(sport?.region || {})) {
        for (const comp of Object.values(region?.competition || {})) {
          for (const [gid, game] of Object.entries(comp?.game || {})) {
            sampleGame = game;
            gameId = gid;
            break;
          }
          if (sampleGame) break;
        }
        if (sampleGame) break;
      }
      if (sampleGame) break;
    }
  }
  
  if (sampleGame) {
    const fields = Object.keys(sampleGame).sort();
    console.log('Game fields (' + fields.length + '):', fields);
    console.log('\nSample game:');
    console.log(JSON.stringify(sampleGame, null, 2));
  }

  // 2. Get ALL market/event fields
  console.log('\n\n========== ALL MARKET/EVENT FIELDS ==========\n');
  if (gameId) {
    const marketsRes = await send('get', {
      source: 'betting',
      what: { market: [], event: [] },
      where: { game: { id: parseInt(gameId) } }
    });
    
    const mData = marketsRes.data?.data;
    if (mData?.market) {
      const marketId = Object.keys(mData.market)[0];
      const market = mData.market[marketId];
      console.log('Market fields:', Object.keys(market).sort());
      
      if (market?.event) {
        const eventId = Object.keys(market.event)[0];
        const event = market.event[eventId];
        console.log('Event fields:', Object.keys(event).sort());
        console.log('\nSample event:', JSON.stringify(event, null, 2));
      }
    }
  }

  // 3. Boosted selections (enhanced odds)
  console.log('\n\n========== BOOSTED SELECTIONS ==========\n');
  const boosted = await send('get_boosted_selections', {});
  const boostedData = boosted.data?.details;
  if (boostedData && Object.keys(boostedData).length > 0) {
    console.log('Games with boosted odds:', Object.keys(boostedData).length);
    const firstGameId = Object.keys(boostedData)[0];
    console.log('Sample boosted selections for game', firstGameId + ':');
    console.log(JSON.stringify(boostedData[firstGameId], null, 2));
  }

  // 4. Competition/region fields
  console.log('\n\n========== COMPETITION/REGION FIELDS ==========\n');
  const hierRes = await send('get', {
    source: 'betting',
    what: {
      sport: [],
      region: [],
      competition: []
    },
    where: { sport: { id: 1 } }
  });
  
  const hData = hierRes.data?.data;
  if (hData?.sport) {
    const sport = Object.values(hData.sport)[0];
    console.log('Sport fields:', Object.keys(sport).sort());
    
    if (sport?.region) {
      const region = Object.values(sport.region)[0];
      console.log('Region fields:', Object.keys(region).sort());
      
      if (region?.competition) {
        const comp = Object.values(region.competition)[0];
        console.log('Competition fields:', Object.keys(comp).sort());
      }
    }
  }

  // 5. Check what commands exist
  console.log('\n\n========== AVAILABLE COMMANDS ==========\n');
  const commands = [
    'get_sports', 'get_boosted_selections', 'get_partner_config',
    'get_jackpots', 'get_promotions', 'get_banners',
    'get_popular_events', 'get_top_events', 'get_featured_events',
    'get_live_calendar', 'get_combo_bets', 'get_super_bets',
    'get_active_competitions', 'get_result_games', 'get_results'
  ];
  
  for (const cmd of commands) {
    try {
      const res = await send(cmd, {});
      if (res.code === 0) {
        const hasData = res.data && (
          (Array.isArray(res.data) && res.data.length > 0) ||
          (typeof res.data === 'object' && Object.keys(res.data).length > 0)
        );
        console.log(`✅ ${cmd}:`, hasData ? 'has data' : 'empty');
      }
    } catch (e) {
      // timeout = probably doesn't exist
    }
  }

  ws.close();
  console.log('\n\nDone!');
}

explore().catch(console.error);
