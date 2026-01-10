const { safeWrite, safePing } = require('../lib/liveStream/sse');
const { getSportFp, getOddsFp } = require('../lib/liveStream/fingerprints');
const {
    getSportMainMarketTypePriority,
    pickPreferredMarketFromEmbedded,
    buildOddsArrFromMarket
} = require('../lib/liveStream/odds');
const { unwrapSwarmData } = require('../lib/swarm/unwrap');

function registerPrematchStreamRoutes(app, { scraper, noStore, parseGamesFromData }) {
    // Server-side cache for prematch games per sport
    const sportCache = new Map(); // sportId -> { games, lastFetch, lastFp, clients: Set, subscription, sportName }

    const ODDS_POLL_MS = 3000;
    const ODDS_GAME_CHUNK_SIZE = 160;

    /**
     * Parse games from raw data
     */
    function parseGamesFromRawData(rawData, sportName) {
        let games = parseGamesFromData(rawData, sportName);
        
        // Filter to prematch only using Forzza's exact logic
        games = games.filter(g => {
            return g?.visible_in_prematch === 1 || [0, 2].includes(Number(g?.type));
        });

        games.forEach((g, idx) => {
            g.__clientId = String(g.id ?? g.gameId ?? idx);
        });

        return games;
    }

    /**
     * Fetch fresh games using subscription if possible, fallback to regular fetch
     */
    async function fetchFreshGames(sportId, sportName, entry) {
        try {
            // Try to create subscription for real-time updates
            if (!entry.subscription) {
                console.log(`🔄 Creating subscription for sport ${sportId}...`);
                
                entry.subscription = await scraper.subscribeToPrematchGames(sportId, (fullData, delta) => {
                    console.log(`📡 Received subscription update for sport ${sportId}`);
                    const games = parseGamesFromRawData({ data: fullData }, sportName);
                    entry.games = games;
                    entry.lastFetch = Date.now();
                    broadcastToClients(sportId, games, sportName, entry);
                });

                if (entry.subscription.subid) {
                    console.log(`✅ Subscription created for sport ${sportId} with subid: ${entry.subscription.subid}`);
                    const games = parseGamesFromRawData({ data: entry.subscription.data }, sportName);
                    return games;
                } else {
                    console.log(`⚠️ Subscription failed for sport ${sportId}, using fallback`);
                    entry.subscription = null;
                }
            }

            // Fallback to regular fetch if subscription failed
            if (!entry.subscription) {
                const raw = await scraper.getGamesBySport(sportId);
                return parseGamesFromRawData(raw, sportName);
            }

            // Use subscription data
            const games = parseGamesFromRawData({ data: entry.subscription.getData() }, sportName);
            return games;
            
        } catch (e) {
            console.error(`❌ Failed to fetch games for sport ${sportId}:`, e.message);
            // Clean up failed subscription
            if (entry.subscription) {
                try {
                    entry.subscription.unsubscribe();
                } catch {}
                entry.subscription = null;
            }
            throw e;
        }
    }

    /**
     * Broadcast games to all clients watching a sport
     */
    function broadcastToClients(sportId, games, sportName, entry) {
        if (!entry || entry.clients.size === 0) return;

        const fp = getSportFp(games);
        if (fp === entry.lastFp) return; // No changes
        
        entry.lastFp = fp;

        const payload = {
            sportId,
            sportName,
            count: games.length,
            last_updated: new Date().toISOString(),
            subscription_active: Boolean(entry.subscription?.subid),
            data: games
        };

        for (const res of entry.clients) {
            safeWrite(res, 'games', payload);
        }
    }

     async function fetchAndBroadcastOdds(sportId, entry) {
         if (!entry || entry.clients.size === 0) return;
         if (entry.oddsInFlight) return;

         const sportName = entry.sportName || 'Unknown';
         const games = Array.isArray(entry.games) ? entry.games : [];
         const gameIds = games.map(g => Number.parseInt(String(g?.id ?? g?.gameId ?? ''), 10)).filter(Number.isFinite);
         if (gameIds.length === 0) return;

         entry.oddsInFlight = true;
         try {
             const typePriority = getSportMainMarketTypePriority(sportName);
             const types = Array.isArray(typePriority) && typePriority.length ? typePriority : ['P1P2', 'P1XP2'];

             const prevByGame = entry.lastOddsFp instanceof Map ? entry.lastOddsFp : new Map();
             const nextByGame = new Map(prevByGame);
             const updates = [];

             for (let i = 0; i < gameIds.length; i += ODDS_GAME_CHUNK_SIZE) {
                 const chunk = gameIds.slice(i, i + ODDS_GAME_CHUNK_SIZE);

                 const rawOdds = await scraper.sendRequest('get', {
                     source: 'betting',
                     what: {
                         game: ['id', 'market', 'markets_count'],
                         market: ['id', 'name', 'type', 'order', 'col_count', 'mobile_col_count', 'display_key', 'event', 'is_blocked', 'cashout', 'available_for_betbuilder', 'group_id', 'group_name', 'group_order', 'display_color', 'market_type', 'display_sub_key', 'sequence', 'point_sequence', 'optimal', 'name_template', 'express_id', 'is_new'],
                         event: ['id', 'name', 'price', 'order', 'original_order', 'alt_order', 'type', 'type_1', 'base', 'is_blocked', 'home_value', 'away_value', 'type_id']
                     },
                     where: {
                         game: { id: { '@in': chunk } },
                         market: { type: { '@in': types } }
                     }
                 }, 90000);

                 const oddsData = unwrapSwarmData(rawOdds);
                 const oddsGames = oddsData?.game && typeof oddsData.game === 'object' ? oddsData.game : {};

                 for (const gid of chunk) {
                     const embedded = oddsGames[String(gid)];
                     const market = pickPreferredMarketFromEmbedded(embedded?.market, typePriority);
                     if (!market) continue;

                     const fp = getOddsFp(market);
                     if (!fp) continue;
                     if (fp === prevByGame.get(String(gid))) continue;
                     nextByGame.set(String(gid), fp);

                     const oddsArr = buildOddsArrFromMarket(market);
                     if (!oddsArr) continue;

                     const g = games.find(x => {
                         const sid = Number.parseInt(String(x?.id ?? x?.gameId ?? ''), 10);
                         return Number.isFinite(sid) && sid === gid;
                     });

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

                     if (entry.lastOddsByGame && typeof entry.lastOddsByGame.set === 'function') {
                         entry.lastOddsByGame.set(String(gid), {
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
                 }
             }

             entry.lastOddsFp = nextByGame;
             entry.lastOddsFetchAt = Date.now();

             if (updates.length > 0) {
                 const payload = {
                     sportId,
                     sportName,
                     server_ts: Date.now(),
                     updates
                 };

                 for (const res of entry.clients) {
                     safeWrite(res, 'odds', payload);
                 }
             }
         } catch (e) {
             const payload = { sportId, error: e?.message || 'Prematch odds error', timestamp: new Date().toISOString() };
             for (const res of entry.clients) safeWrite(res, 'error', payload);
         } finally {
             entry.oddsInFlight = false;
         }
     }

     function startOddsPolling(sportId, entry) {
         if (!entry) return;
         if (entry.oddsIntervalId) {
             fetchAndBroadcastOdds(sportId, entry);
             return;
         }

         entry.oddsIntervalId = setInterval(() => {
             if (entry.clients.size === 0) return;
             fetchAndBroadcastOdds(sportId, entry);
         }, ODDS_POLL_MS);

         fetchAndBroadcastOdds(sportId, entry);
     }

     function sendCachedOddsSnapshotToClient(sportId, entry, res) {
         if (!entry || !res) return;
         const byGame = entry.lastOddsByGame instanceof Map ? entry.lastOddsByGame : null;
         if (!byGame || byGame.size === 0) return;

         const games = Array.isArray(entry.games) ? entry.games : [];
         const gameIds = games.map(g => Number.parseInt(String(g?.id ?? g?.gameId ?? ''), 10)).filter(Number.isFinite);
         if (gameIds.length === 0) return;

         const updates = [];
         for (const gid of gameIds) {
             const cached = byGame.get(String(gid));
             if (!cached || !Array.isArray(cached?.odds)) continue;
             updates.push({
                 gameId: gid,
                 odds: cached.odds,
                 markets_count: typeof cached?.markets_count === 'number' ? cached.markets_count : null,
                 market: cached.market || null
             });
         }

         if (updates.length === 0) return;

         safeWrite(res, 'odds', {
             sportId,
             sportName: entry.sportName || 'Unknown',
             server_ts: Date.now(),
             updates
         });
     }

    /**
     * Update cache and broadcast to clients
     */
    async function updateCacheAndBroadcast(sportId, sportName, entry) {
        try {
            const games = await fetchFreshGames(sportId, sportName, entry);
            entry.games = games;
            entry.lastFetch = Date.now();
            entry.sportName = sportName;
            
            broadcastToClients(sportId, games, sportName, entry);
            
            const subStatus = entry.subscription?.subid ? ' (subscribed)' : ' (polling)';
            console.log(`Updated cache for sport ${sportId}: ${games.length} games${subStatus}`);
        } catch (e) {
            console.error(`Failed to update cache for sport ${sportId}:`, e.message);
        }
    }

    /**
     * Start polling for a sport (only if no subscription)
     */
    function startPolling(sportId, sportName, entry) {
        // Don't poll if we have an active subscription
        if (entry.subscription?.subid) {
            console.log(`Skipping polling for sport ${sportId} - subscription active`);
            return;
        }

        if (entry.pollIntervalId) return;

        console.log(`Starting polling for sport ${sportId} every 15 seconds (no subscription)`);
        
        // Poll every 15 seconds for updates
        entry.pollIntervalId = setInterval(async () => {
            if (entry.clients.size === 0) return;
            if (entry.subscription?.subid) {
                // Subscription became active, stop polling
                clearInterval(entry.pollIntervalId);
                entry.pollIntervalId = null;
                console.log(`Stopped polling for sport ${sportId} - subscription now active`);
                return;
            }
            await updateCacheAndBroadcast(sportId, sportName, entry);
        }, 15000);
    }

    /**
     * Ensure we have cached data for a sport
     */
    async function ensureCachedData(sportId, sportName) {
        const key = String(sportId);
        let entry = sportCache.get(key);
        
        if (!entry) {
            entry = {
                games: [],
                lastFetch: 0,
                lastFp: null,
                lastOddsFp: new Map(),
                lastOddsByGame: new Map(),
                lastOddsFetchAt: 0,
                oddsIntervalId: null,
                oddsInFlight: false,
                clients: new Set(),
                subscription: null,
                pollIntervalId: null,
                sportName
            };
            sportCache.set(key, entry);
        }

        entry.sportName = sportName;

        // Check if we have fresh cached data (less than 30 seconds old)
        const now = Date.now();
        const cacheAge = now - entry.lastFetch;
        const hasFreshCache = entry.games.length > 0 && cacheAge < 30000;

        if (!hasFreshCache) {
            console.log(`Fetching fresh data for sport ${sportId} (cache age: ${Math.round(cacheAge/1000)}s)`);
            await updateCacheAndBroadcast(sportId, sportName, entry);
        } else {
            console.log(`Using cached data for sport ${sportId} (${entry.games.length} games, age: ${Math.round(cacheAge/1000)}s)`);
        }

        return entry;
    }

    /**
     * Clean up if no clients
     */
    function cleanupIfIdle(sportId) {
        const key = String(sportId);
        const entry = sportCache.get(key);
        if (!entry) return;

        if (entry.cleanupTimeoutId) {
            clearTimeout(entry.cleanupTimeoutId);
            entry.cleanupTimeoutId = null;
        }

        if (entry.clients.size === 0) {
            // Stop polling
            if (entry.pollIntervalId) {
                clearInterval(entry.pollIntervalId);
                entry.pollIntervalId = null;
                console.log(`Stopped polling for sport ${sportId}`);
            }

             if (entry.oddsIntervalId) {
                 clearInterval(entry.oddsIntervalId);
                 entry.oddsIntervalId = null;
                 entry.oddsInFlight = false;
                 entry.lastOddsFp = new Map();
                 entry.lastOddsByGame = new Map();
                 console.log(`Stopped odds polling for sport ${sportId}`);
             }
            
            if (entry.subscription) {
                try {
                    entry.subscription.unsubscribe();
                    console.log(`Unsubscribed from sport ${sportId}`);
                } catch (e) {
                    console.error(`Failed to unsubscribe from sport ${sportId}:`, e.message);
                }
                entry.subscription = null;
            }
        }
    }

    // SSE endpoint for prematch games stream
    app.get('/api/prematch-stream', async (req, res) => {
        const sportId = req.query?.sportId;
        const sportName = req.query?.sportName || 'Unknown';
        
        if (!sportId) {
            return res.status(400).json({ error: 'sportId is required' });
        }

        try {
            noStore(res);
            res.status(200);
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache, no-transform');
            res.setHeader('Connection', 'keep-alive');
            res.setHeader('X-Accel-Buffering', 'no');
            if (typeof res.flushHeaders === 'function') res.flushHeaders();

             const key = String(sportId);
             
             // Ensure we have cached data
             const entry = await ensureCachedData(sportId, sportName);
             const wasIdle = entry.clients.size === 0;
             entry.clients.add(res);

             if (entry.cleanupTimeoutId) {
                 clearTimeout(entry.cleanupTimeoutId);
                 entry.cleanupTimeoutId = null;
             }

             if (wasIdle) {
                 entry.lastOddsFp = new Map();
                 entry.lastOddsFetchAt = 0;
             }

            // Send current cached data immediately
            const payload = {
                sportId,
                sportName: entry.sportName,
                count: entry.games.length,
                last_updated: new Date(entry.lastFetch).toISOString(),
                subscription_active: Boolean(entry.subscription?.subid),
                data: entry.games
            };
            
            safeWrite(res, 'games', payload);
            entry.lastFp = getSportFp(entry.games);

            sendCachedOddsSnapshotToClient(sportId, entry, res);

            startOddsPolling(sportId, entry);

            // Start polling for updates (only if no subscription)
            startPolling(sportId, sportName, entry);

            // Heartbeat
            const heartbeatId = setInterval(() => safePing(res), 15000);

            req.on('close', () => {
                clearInterval(heartbeatId);
                const entry = sportCache.get(key);
                if (entry) {
                    entry.clients.delete(res);
                    if (entry.clients.size === 0) {
                        if (entry.cleanupTimeoutId) clearTimeout(entry.cleanupTimeoutId);
                        entry.cleanupTimeoutId = setTimeout(() => cleanupIfIdle(sportId), 60000);
                    }
                }
            });
        } catch (e) {
            console.error('Prematch stream error:', e.message);
            try {
                safeWrite(res, 'error', { error: e.message });
            } catch {
                // Response already sent
            }
        }
    });

    // REST endpoint that uses cache (instant response if cached)
    app.get('/api/prematch-games', async (req, res) => {
        const sportId = req.query?.sportId;
        const sportName = req.query?.sportName || 'Unknown';
        
        if (!sportId) {
            return res.status(400).json({ error: 'sportId is required' });
        }

        try {
            noStore(res);

            const key = String(sportId);
            let entry = sportCache.get(key);
            
            // Check if we have recent cached data (less than 60 seconds old)
            if (entry && entry.games.length > 0) {
                const cacheAge = Date.now() - entry.lastFetch;
                if (cacheAge < 60000) {
                    return res.json({
                        source: 'cache',
                        sportId,
                        sportName: entry.sportName,
                        count: entry.games.length,
                        cache_age_seconds: Math.round(cacheAge / 1000),
                        last_updated: new Date(entry.lastFetch).toISOString(),
                        subscription_active: Boolean(entry.subscription?.subid),
                        data: entry.games
                    });
                }
            }

            // No cache or stale cache - fetch fresh data
            entry = await ensureCachedData(sportId, sportName);

            res.json({
                source: 'fresh',
                sportId,
                sportName: entry.sportName,
                count: entry.games.length,
                last_updated: new Date(entry.lastFetch).toISOString(),
                subscription_active: Boolean(entry.subscription?.subid),
                data: entry.games
            });
        } catch (e) {
            console.error('Prematch games error:', e.message);
            res.status(500).json({ error: e.message });
        }
    });
}

module.exports = { registerPrematchStreamRoutes };
