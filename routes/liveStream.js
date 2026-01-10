const { safeWrite, safePing } = require('../lib/liveStream/sse');
const { getGameFp, getCountsFp, getSportFp, getOddsFp } = require('../lib/liveStream/fingerprints');
const {
  getSportMainMarketTypePriority,
  pickPreferredMarketFromEmbedded,
  buildOddsArrFromMarket
} = require('../lib/liveStream/odds');
const { createGetSportName } = require('../lib/liveStream/sportNameCache');
const { unwrapSwarmData } = require('../lib/swarm/unwrap');

function registerLiveStreamRoutes(app, { scraper, noStore, parseGamesFromData }) {
  const clients = new Set();
  const sportClients = new Map();

  const gameClients = new Map();
  const gameIntervals = new Map();
  const gameInFlight = new Map();
  const lastGameFp = new Map();
  const gameSubscriptions = new Map();
  const gameSubscriptionStartInFlight = new Map();

  let countsIntervalId = null;
  let countsInFlight = false;
  let lastCountsFp = null;
  let lastPrematchCountsFp = null;

  const sportIntervals = new Map();
  const sportInFlight = new Map();
  const lastSportFp = new Map();

  const lastSportOddsFp = new Map();
  
  // Cache for instant initial response
  const sportDataCache = new Map(); // key -> { data, timestamp }
  const CACHE_TTL = 10000; // 10 seconds
  
  // Subscription-based sport data (replaces polling)
  const sportSubscriptions = new Map();
  const sportSubscriptionStartInFlight = new Map();

  const getSportName = createGetSportName(scraper);

  const writeToSet = (set, eventName, payload) => {
    if (!set || set.size === 0) return;
    for (const res of Array.from(set)) {
      const ok = safeWrite(res, eventName, payload);
      if (!ok) set.delete(res);
    }
  };

  const pingSet = (set) => {
    if (!set || set.size === 0) return;
    for (const res of Array.from(set)) {
      const ok = safePing(res);
      if (!ok) set.delete(res);
    }
  };

  // Shared fetch logic for counts data (both live and prematch)
  const fetchCountsData = async () => {
    if (clients.size === 0) return;
    if (countsInFlight) return;
    countsInFlight = true;
    try {
      // Fetch live counts - exclude sport types 1 and 4 (Forzza's filter)
      const rawLiveData = await scraper.sendRequest('get', {
        source: 'betting',
        what: { sport: ['id', 'name'], game: ['id'] },
        where: {
          sport: { type: { '@nin': [1, 4] } },
          game: { type: 1 }
        }
      });

      const liveData = rawLiveData?.data?.data ? rawLiveData.data.data : (rawLiveData?.data || rawLiveData);
      const liveSports = [];
      let liveTotalGames = 0;

      if (liveData && liveData.sport) {
        for (const s of Object.values(liveData.sport)) {
          const name = s?.name;
          const count = s?.game ? Object.keys(s.game).length : 0;
          if (name && count > 0) {
            liveSports.push({ name, count });
            liveTotalGames += count;
          }
        }
      }

      const liveFp = getCountsFp(liveSports);
      if (liveFp !== lastCountsFp) {
        lastCountsFp = liveFp;
        const payload = {
          source: 'swarm',
          count: liveSports.length,
          total_games: liveTotalGames,
          sports: liveSports,
          timestamp: new Date().toISOString()
        };
        writeToSet(clients, 'counts', payload);
      }

      // Fetch prematch counts - using Forzza's exact filter
      const rawPrematchData = await scraper.sendRequest('get', {
        source: 'betting',
        what: { sport: ['id', 'name'], game: ['id'] },
        where: {
          game: {
            '@or': [
              { visible_in_prematch: 1 },
              { type: { '@in': [0, 2] } }
            ]
          },
          sport: {
            type: { '@nin': [1, 4] }
          }
        }
      });

      const prematchData = rawPrematchData?.data?.data ? rawPrematchData.data.data : (rawPrematchData?.data || rawPrematchData);
      const prematchSports = [];
      let prematchTotalGames = 0;

      if (prematchData && prematchData.sport) {
        for (const s of Object.values(prematchData.sport)) {
          const name = s?.name;
          const count = s?.game ? Object.keys(s.game).length : 0;
          if (name && count > 0) {
            prematchSports.push({ name, count });
            prematchTotalGames += count;
          }
        }
      }

      const prematchFp = getCountsFp(prematchSports);
      if (prematchFp !== lastPrematchCountsFp) {
        lastPrematchCountsFp = prematchFp;
        const payload = {
          source: 'swarm',
          count: prematchSports.length,
          total_games: prematchTotalGames,
          sports: prematchSports,
          timestamp: new Date().toISOString()
        };
        writeToSet(clients, 'prematch_counts', payload);
      }

      // Send ping if nothing changed
      if (liveFp === lastCountsFp && prematchFp === lastPrematchCountsFp) {
        pingSet(clients);
      }
    } catch (e) {
      const payload = { error: e?.message || 'Live counts error', timestamp: new Date().toISOString() };
      writeToSet(clients, 'error', payload);
    } finally {
      stopCountsIfIdle();
      countsInFlight = false;
    }
  };

  const startCounts = () => {
    if (countsIntervalId) return;

    // Fetch immediately on first client connection
    fetchCountsData();

    // Then continue polling every 3 seconds
    countsIntervalId = setInterval(() => fetchCountsData(), 1000);
  };

  const stopCountsIfIdle = () => {
    if (clients.size > 0) return;
    if (countsIntervalId) clearInterval(countsIntervalId);
    countsIntervalId = null;
    countsInFlight = false;
    lastCountsFp = null;
  };

  // Try to enable subscription-based live sport updates (replaces polling)
  const tryEnableSportSubscription = async (sportId) => {
    const key = String(sportId);
    if (sportSubscriptions.has(key)) return true;
    if (sportSubscriptionStartInFlight.get(key)) return false;
    sportSubscriptionStartInFlight.set(key, true);

    try {
      const name = await getSportName(key);
      const typePriority = getSportMainMarketTypePriority(name);
      const types = Array.isArray(typePriority) && typePriority.length ? typePriority : ['P1P2', 'P1XP2'];

      // Single subscription: games + embedded main market odds
      const sub = await scraper.subscribe({
        source: 'betting',
        what: {
          sport: ['id', 'name'],
          region: ['id', 'name', 'order'],
          competition: ['id', 'name', 'order', 'favorite', 'favorite_order', 'teams_reversed'],
          game: [
            'id', 'team1_name', 'team2_name', 'team1_id', 'team2_id',
            'start_ts', 'type', 'is_blocked', 'markets_count', 'info',
            'stats', 'score1', 'score2', 'text_info', 'live_events',
            'is_live', 'is_started', 'game_number', 'match_length',
            'strong_team', 'round', 'region_alias', 'last_event', 'live_available',
            'promoted', 'is_neutral_venue', 'season_id', 'sport_alias'
          ],
          market: ['id', 'name', 'type', 'order', 'col_count', 'mobile_col_count', 'display_key', 'is_blocked', 'market_type', 'display_sub_key', 'sequence', 'point_sequence', 'optimal', 'name_template', 'express_id', 'is_new', 'group_order'],
          event: ['id', 'name', 'price', 'order', 'original_order', 'alt_order', 'type', 'type_1', 'base', 'is_blocked']
        },
        where: {
          sport: { id: parseInt(key) },
          game: { type: 1 }
          // Removed market type filter - was excluding games without matching market types
        },
        subscribe: true
      }, (fullData, delta) => {
        // Called on each incremental update from Swarm
        const set = sportClients.get(key);

        // Parse games from subscription data
        let games = parseGamesFromData({ data: fullData }, name);
        games = games.filter(g => Number(g?.type) === 1);
        games.forEach((g, idx) => { g.__clientId = String(g.id ?? idx); });

        // Cache for instant response to new clients
        const payload = {
          sportId: key,
          sportName: name,
          count: games.length,
          last_updated: new Date().toISOString(),
          data: games
        };
        sportDataCache.set(key, { data: payload, timestamp: Date.now() });

        const fp = getSportFp(games);
        if (fp !== lastSportFp.get(key)) {
          lastSportFp.set(key, fp);
          if (set && set.size > 0) {
            writeToSet(set, 'games', payload);
          }
        }

        // Extract odds from embedded markets
        const prevByGame = lastSportOddsFp.get(key) instanceof Map ? lastSportOddsFp.get(key) : new Map();
        const nextByGame = new Map(prevByGame);
        const updates = [];

        for (const g of games) {
          const gid = parseInt(g?.id);
          if (!Number.isFinite(gid) || !g.market) continue;

          const market = pickPreferredMarketFromEmbedded(g.market, typePriority);
          if (!market) continue;

          const fp = getOddsFp(market);
          if (!fp || fp === prevByGame.get(String(gid))) continue;
          nextByGame.set(String(gid), fp);

          const oddsArr = buildOddsArrFromMarket(market);
          if (!oddsArr) continue;

          updates.push({
            gameId: gid,
            odds: oddsArr,
            markets_count: g?.markets_count ?? null,
            market: { id: market?.id, type: market?.type, display_key: market?.display_key }
          });
        }

        lastSportOddsFp.set(key, nextByGame);
        if (updates.length > 0) {
          writeToSet(set, 'odds', { sportId: key, sportName: name, server_ts: Date.now(), updates });
        }
      });

      if (!sub?.subid) {
        if (sub?.unsubscribe) try { await sub.unsubscribe(); } catch {}
        return false;
      }

      sportSubscriptions.set(key, sub);
      
      // Stop polling interval since subscription is active
      const intervalId = sportIntervals.get(key);
      if (intervalId) clearInterval(intervalId);
      sportIntervals.delete(key);

      // Send initial data
      const initial = sub.getData ? sub.getData() : sub.data;
      let games = parseGamesFromData({ data: initial }, name);
      games = games.filter(g => Number(g?.type) === 1);
      games.forEach((g, idx) => { g.__clientId = String(g.id ?? idx); });

      const set = sportClients.get(key);
      if (set && set.size > 0) {
        writeToSet(set, 'games', {
          sportId: key,
          sportName: name,
          count: games.length,
          last_updated: new Date().toISOString(),
          data: games
        });
      }

      console.log(`✅ Sport ${key} using subscription (no polling)`);
      return true;
    } catch (e) {
      console.log(`⚠️ Sport ${key} subscription failed, using polling:`, e.message);
      return false;
    } finally {
      sportSubscriptionStartInFlight.delete(key);
    }
  };

  // Shared fetch logic for sport data (fallback when subscription fails)
  const fetchSportData = async (key) => {
    const set = sportClients.get(key);
    if (!set || set.size === 0) return;
    if (sportInFlight.get(key)) return;
    sportInFlight.set(key, true);
    try {
      const name = await getSportName(key);
      const raw = await scraper.getGamesBySport(key);
      let games = parseGamesFromData(raw, name);
      games = games.filter(g => Number(g?.type) === 1);

      games.forEach((g, idx) => {
        g.__clientId = String(g.id ?? g.gameId ?? idx);
      });

      const fp = getSportFp(games);
      if (fp !== lastSportFp.get(key)) {
        lastSportFp.set(key, fp);
        const payload = {
          sportId: key,
          sportName: name,
          count: games.length,
          last_updated: new Date().toISOString(),
          data: games
        };
        writeToSet(set, 'games', payload);
      }

      const gameIds = games.map(g => parseInt(g?.id)).filter(Number.isFinite);
      if (gameIds.length > 0) {
        const typePriority = getSportMainMarketTypePriority(name);
        const types = Array.isArray(typePriority) && typePriority.length ? typePriority : ['P1P2', 'P1XP2'];

        const rawOdds = await scraper.sendRequest('get', {
          source: 'betting',
          what: {
            game: ['id', 'market'],
            market: ['id', 'name', 'type', 'order', 'col_count', 'mobile_col_count', 'display_key', 'event', 'is_blocked', 'cashout', 'available_for_betbuilder', 'group_id', 'group_name', 'group_order', 'display_color', 'market_type', 'display_sub_key', 'sequence', 'point_sequence', 'optimal', 'name_template', 'express_id', 'is_new'],
            event: ['id', 'name', 'price', 'order', 'original_order', 'alt_order', 'type', 'type_1', 'base', 'is_blocked', 'home_value', 'away_value', 'type_id']
          },
          where: {
            game: { id: { '@in': gameIds } },
            market: { type: { '@in': types } }
          }
        }, 90000);

        const oddsData = unwrapSwarmData(rawOdds);
        const oddsGames = oddsData?.game && typeof oddsData.game === 'object' ? oddsData.game : {};

        const prevByGame = lastSportOddsFp.get(key) instanceof Map ? lastSportOddsFp.get(key) : new Map();
        const nextByGame = new Map(prevByGame);
        const updates = [];

        for (const g of games) {
          const gid = parseInt(g?.id);
          if (!Number.isFinite(gid)) continue;

          const embedded = oddsGames[String(gid)];
          const market = pickPreferredMarketFromEmbedded(embedded?.market, typePriority);
          if (!market) continue;

          const fp = getOddsFp(market);
          if (!fp) continue;
          if (fp === prevByGame.get(String(gid))) continue;
          nextByGame.set(String(gid), fp);

          const oddsArr = buildOddsArrFromMarket(market);
          if (!oddsArr) continue;

          updates.push({
            gameId: gid,
            odds: oddsArr,
            markets_count: typeof g?.markets_count === 'number' ? g.markets_count : null,
            market: {
              id: market?.id,
              type: market?.type,
              display_key: market?.display_key,
              order: market?.order,
              name: market?.name
            }
          });
        }

        lastSportOddsFp.set(key, nextByGame);
        if (updates.length > 0) {
          const payload = {
            sportId: key,
            sportName: name,
            server_ts: Date.now(),
            updates
          };
          writeToSet(set, 'odds', payload);
        }
      }

      if (fp === lastSportFp.get(key)) {
        pingSet(set);
      }
    } catch (e) {
      const payload = { sportId: key, error: e?.message || 'Live sport error', timestamp: new Date().toISOString() };
      const set = sportClients.get(key);
      if (set) writeToSet(set, 'error', payload);
    } finally {
      sportInFlight.set(key, false);
      stopSportIfIdle(key);
    }
  };

  const startSport = (sportId) => {
    const key = String(sportId);
    if (sportIntervals.has(key) || sportSubscriptions.has(key)) return;

    // Try subscription first (optimal - no polling)
    tryEnableSportSubscription(key).then(success => {
      if (!success && !sportIntervals.has(key) && !sportSubscriptions.has(key)) {
        // Fallback to polling if subscription failed
        fetchSportData(key);
        sportIntervals.set(key, setInterval(() => fetchSportData(key), 1000));
      }
    });
  };

  const stopSportIfIdle = (sportId) => {
    const key = String(sportId);
    const set = sportClients.get(key);
    if (set && set.size > 0) return;
    sportClients.delete(key);
    const intervalId = sportIntervals.get(key);
    if (intervalId) clearInterval(intervalId);
    sportIntervals.delete(key);
    sportInFlight.delete(key);
    lastSportFp.delete(key);
    lastSportOddsFp.delete(key);
    
    // Clean up subscription
    const sub = sportSubscriptions.get(key);
    if (sub && typeof sub.unsubscribe === 'function') {
      try { Promise.resolve(sub.unsubscribe()).catch(() => {}); } catch {}
    }
    sportSubscriptions.delete(key);
    sportSubscriptionStartInFlight.delete(key);
  };

  // Shared fetch logic for game data
  const fetchGameData = async (key) => {
    const set = gameClients.get(key);
    if (!set || set.size === 0) return;
    if (gameInFlight.get(key)) return;
    gameInFlight.set(key, true);
    try {
      const raw = await scraper.sendRequest('get', {
        source: 'betting',
        what: {
          market: ['id', 'name', 'type', 'order', 'col_count', 'display_key', 'is_blocked', 'cashout', 'available_for_betbuilder', 'group_id', 'group_name', 'display_color'],
          event: ['id', 'name', 'price', 'order', 'original_order', 'alt_order', 'type', 'type_1', 'base', 'is_blocked', 'home_value', 'away_value', 'type_id']
        },
        where: {
          game: { id: parseInt(key) }
        }
      });

      const data = unwrapSwarmData(raw);
      const fp = getGameFp(data);
      if (fp !== lastGameFp.get(key)) {
        lastGameFp.set(key, fp);
        const payload = {
          gameId: parseInt(key),
          server_ts: Date.now(),
          data
        };
        writeToSet(set, 'game', payload);
      } else {
        pingSet(set);
      }
    } catch (e) {
      const payload = { gameId: parseInt(key), error: e?.message || 'Live game error', timestamp: new Date().toISOString() };
      const set = gameClients.get(key);
      if (set) writeToSet(set, 'error', payload);
    } finally {
      gameInFlight.set(key, false);
      stopGameIfIdle(key);
    }
  };

  const tryEnableGameSubscription = async (key) => {
    if (gameSubscriptions.has(key)) return true;
    if (gameSubscriptionStartInFlight.get(key)) return false;
    gameSubscriptionStartInFlight.set(key, true);

    try {
      const sub = await scraper.subscribeToGameMarkets(key, (fullData) => {
        const set = gameClients.get(key);
        if (!set || set.size === 0) return;

        const fp = getGameFp(fullData);
        if (fp !== lastGameFp.get(key)) {
          lastGameFp.set(key, fp);
          const payload = {
            gameId: parseInt(key),
            server_ts: Date.now(),
            data: fullData
          };
          writeToSet(set, 'game', payload);
        }
      });

      if (!sub?.subid) {
        if (sub?.unsubscribe) {
          try { await sub.unsubscribe(); } catch { /* ignore */ }
        }
        return false;
      }

      gameSubscriptions.set(key, sub);
      const intervalId = gameIntervals.get(key);
      if (intervalId) clearInterval(intervalId);
      gameIntervals.delete(key);

      const initial = sub.getData ? sub.getData() : sub.data;
      const fp = getGameFp(initial);
      lastGameFp.set(key, fp);
      const set = gameClients.get(key);
      if (set && set.size > 0) {
        const payload = {
          gameId: parseInt(key),
          server_ts: Date.now(),
          data: initial
        };
        writeToSet(set, 'game', payload);
      }

      return true;
    } catch {
      return false;
    } finally {
      gameSubscriptionStartInFlight.delete(key);
    }
  };

  const startGame = (gameId) => {
    const key = String(gameId);
    if (gameIntervals.has(key)) return;

    if (gameSubscriptions.has(key)) return;

    // Fetch immediately on first client connection
    fetchGameData(key);

    // Then continue polling every 3 seconds
    gameIntervals.set(key, setInterval(() => fetchGameData(key), 1000));
  };

  const stopGameIfIdle = (gameId) => {
    const key = String(gameId);
    const set = gameClients.get(key);
    if (set && set.size > 0) return;
    gameClients.delete(key);
    const intervalId = gameIntervals.get(key);
    if (intervalId) clearInterval(intervalId);
    gameIntervals.delete(key);
    const sub = gameSubscriptions.get(key);
    if (sub && typeof sub.unsubscribe === 'function') {
      try {
        Promise.resolve(sub.unsubscribe()).catch(() => {});
      } catch {
        // ignore
      }
    }
    gameSubscriptions.delete(key);
    gameSubscriptionStartInFlight.delete(key);
    gameInFlight.delete(key);
    lastGameFp.delete(key);
  };

  app.get('/api/live-stream', async (req, res) => {
    try {
      noStore(res);
      res.status(200);
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      if (typeof res.flushHeaders === 'function') res.flushHeaders();

      clients.add(res);
      startCounts();

      const sportId = req.query?.sportId ? String(req.query.sportId) : null;
      if (sportId) {
        if (!sportClients.has(sportId)) sportClients.set(sportId, new Set());
        sportClients.get(sportId).add(res);
        
        // Send cached data immediately if available (instant response)
        const cached = sportDataCache.get(sportId);
        if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
          safeWrite(res, 'games', cached.data);
        }
        
        startSport(sportId);
      }

      let heartbeatId = null;
      heartbeatId = setInterval(() => {
        const ok = safePing(res);
        if (ok) return;
        clearInterval(heartbeatId);
        clients.delete(res);
        if (sportId) {
          const set = sportClients.get(sportId);
          if (set) {
            set.delete(res);
          }
          stopSportIfIdle(sportId);
        }
        stopCountsIfIdle();
      }, 15000);

      req.on('close', () => {
        clearInterval(heartbeatId);
        clients.delete(res);
        if (sportId) {
          const set = sportClients.get(sportId);
          if (set) {
            set.delete(res);
            if (set.size === 0) stopSportIfIdle(sportId);
          }
        }
        stopCountsIfIdle();
      });
    } catch (e) {
      try {
        res.status(500).end();
      } catch {
        return;
      }
    }
  });

  app.get('/api/live-game-stream', async (req, res) => {
    try {
      const gameId = req.query?.gameId ? String(req.query.gameId) : null;
      if (!gameId) {
        res.status(400).json({ error: 'gameId is required' });
        return;
      }

      noStore(res);
      res.status(200);
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      if (typeof res.flushHeaders === 'function') res.flushHeaders();

      if (!gameClients.has(gameId)) gameClients.set(gameId, new Set());
      gameClients.get(gameId).add(res);

      const ok = await tryEnableGameSubscription(gameId);
      if (!ok) startGame(gameId);

      let heartbeatId = null;
      heartbeatId = setInterval(() => {
        const ok = safePing(res);
        if (ok) return;
        clearInterval(heartbeatId);
        const set = gameClients.get(gameId);
        if (set) {
          set.delete(res);
        }
        stopGameIfIdle(gameId);
      }, 15000);

      req.on('close', () => {
        clearInterval(heartbeatId);
        const set = gameClients.get(gameId);
        if (set) {
          set.delete(res);
          if (set.size === 0) stopGameIfIdle(gameId);
        }
      });
    } catch (e) {
      try {
        res.status(500).end();
      } catch {
        return;
      }
    }
  });
}

module.exports = { registerLiveStreamRoutes };
