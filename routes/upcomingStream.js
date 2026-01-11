const {
    getSportMainMarketTypePriority,
    buildOddsArrFromMarket,
    pickPreferredMarketFromEmbedded
} = require('../lib/liveStream/odds');
const { unwrapSwarmData } = require('../lib/swarm/unwrap');
const { getOddsFp } = require('../lib/liveStream/fingerprints');

function registerUpcomingStreamRoute(app, { scraper }) {
    // Active subscriptions per hours value
    const upcomingSubscriptions = new Map();
    const clientsByHours = new Map();

    const ODDS_GAME_CHUNK_SIZE = 160;
    const ODDS_THROTTLE_MS = 2500;
    const oddsStateByHours = new Map();

    const getOddsState = (hours) => {
        const key = String(hours);
        let st = oddsStateByHours.get(key);
        if (!st) {
            st = {
                inFlight: false,
                lastFetchAt: 0,
                lastFpByGame: new Map(),
                lastOddsByGame: new Map()
            };
            oddsStateByHours.set(key, st);
        }
        return st;
    };

    const getCachedOddsSnapshotForGames = (hours, games) => {
        const st = getOddsState(hours);
        const byGame = st.lastOddsByGame instanceof Map ? st.lastOddsByGame : null;
        if (!byGame || byGame.size === 0) return {};

        const payload = {};
        for (const g of Array.isArray(games) ? games : []) {
            const gid = g?.id;
            if (gid === undefined || gid === null) continue;
            const cached = byGame.get(String(gid));
            if (!Array.isArray(cached) || cached.length === 0) continue;
            payload[String(gid)] = cached;
        }
        return payload;
    };

    const fetchOddsUpdatesForGames = async (hours, games) => {
        const st = getOddsState(hours);
        const now = Date.now();
        if (st.inFlight) return null;
        if (now - (st.lastFetchAt || 0) < ODDS_THROTTLE_MS) return null;

        const list = Array.isArray(games) ? games : [];
        const metasById = new Map();
        const ids = [];
        for (const g of list) {
            const gid = Number.parseInt(String(g?.id ?? ''), 10);
            if (!Number.isFinite(gid)) continue;
            const key = String(gid);
            if (!metasById.has(key)) {
                metasById.set(key, {
                    sport_name: g?.sport_name || g?.sportAlias || g?.sport_alias || ''
                });
                ids.push(gid);
            }
        }
        if (ids.length === 0) return null;

        st.inFlight = true;
        try {
            const allTypes = ['P1XP2', 'W1XW2', '1X2', 'MATCH_RESULT', 'MATCHRESULT', 'P1P2', 'W1W2'];
            const prevFpByGame = st.lastFpByGame instanceof Map ? st.lastFpByGame : new Map();
            const nextFpByGame = new Map(prevFpByGame);
            const lastOddsByGame = st.lastOddsByGame instanceof Map ? st.lastOddsByGame : new Map();
            const updates = {};

            const tryPickOdds = (embedded, typePriority) => {
                if (!embedded || typeof embedded !== 'object') return null;
                const marketMap = embedded?.market;
                const preferred = pickPreferredMarketFromEmbedded(marketMap, typePriority);
                const preferredArr = buildOddsArrFromMarket(preferred);
                if (preferred && preferredArr) return { market: preferred, oddsArr: preferredArr };

                const markets = marketMap && typeof marketMap === 'object' ? Object.values(marketMap).filter(Boolean) : [];
                markets.sort((a, b) => (a?.order ?? Number.MAX_SAFE_INTEGER) - (b?.order ?? Number.MAX_SAFE_INTEGER));
                for (const m of markets) {
                    const arr = buildOddsArrFromMarket(m);
                    if (arr) return { market: m, oddsArr: arr };
                }
                return null;
            };

            for (let i = 0; i < ids.length; i += ODDS_GAME_CHUNK_SIZE) {
                const chunk = ids.slice(i, i + ODDS_GAME_CHUNK_SIZE);

                const rawOdds = await scraper.sendRequest('get', {
                    source: 'betting',
                    what: {
                        game: ['id', 'market', 'markets_count'],
                        market: ['id', 'name', 'type', 'order', 'col_count', 'mobile_col_count', 'display_key', 'event', 'is_blocked', 'cashout', 'available_for_betbuilder', 'group_id', 'group_name', 'group_order', 'display_color', 'market_type', 'display_sub_key', 'sequence', 'point_sequence', 'optimal', 'name_template', 'express_id', 'is_new'],
                        event: ['id', 'name', 'price', 'order', 'original_order', 'alt_order', 'type', 'type_1', 'base', 'is_blocked', 'home_value', 'away_value', 'type_id']
                    },
                    where: {
                        game: { id: { '@in': chunk } },
                        market: { type: { '@in': allTypes } }
                    }
                }, 90000);

                const oddsData = unwrapSwarmData(rawOdds);
                const oddsGames = oddsData?.game && typeof oddsData.game === 'object' ? oddsData.game : {};

                for (const gid of chunk) {
                    const embedded = oddsGames[String(gid)];
                    const meta = metasById.get(String(gid)) || {};
                    const typePriority = getSportMainMarketTypePriority(meta?.sport_name);
                    const picked = tryPickOdds(embedded, typePriority);
                    if (!picked) continue;
                    const { market, oddsArr } = picked;

                    const fp = getOddsFp(market);
                    if (!fp) continue;
                    if (fp === prevFpByGame.get(String(gid))) continue;

                    nextFpByGame.set(String(gid), fp);
                    lastOddsByGame.set(String(gid), oddsArr);
                    updates[String(gid)] = oddsArr;
                }

                const missingIds = [];
                for (const gid of chunk) {
                    const key = String(gid);
                    if (updates[key]) continue;
                    if (lastOddsByGame.has(key)) continue;
                    missingIds.push(gid);
                }

                if (missingIds.length > 0) {
                    const rawFallbackOdds = await scraper.sendRequest('get', {
                        source: 'betting',
                        what: {
                            game: ['id', 'market', 'markets_count'],
                            market: ['id', 'name', 'type', 'order', 'col_count', 'mobile_col_count', 'display_key', 'event', 'is_blocked', 'cashout', 'available_for_betbuilder', 'group_id', 'group_name', 'group_order', 'display_color', 'market_type', 'display_sub_key', 'sequence', 'point_sequence', 'optimal', 'name_template', 'express_id', 'is_new'],
                            event: ['id', 'name', 'price', 'order', 'original_order', 'alt_order', 'type', 'type_1', 'base', 'is_blocked', 'home_value', 'away_value', 'type_id']
                        },
                        where: {
                            game: { id: { '@in': missingIds } }
                        }
                    }, 90000);

                    const fallbackData = unwrapSwarmData(rawFallbackOdds);
                    const fallbackGames = fallbackData?.game && typeof fallbackData.game === 'object' ? fallbackData.game : {};

                    for (const gid of missingIds) {
                        const embedded = fallbackGames[String(gid)];
                        const meta = metasById.get(String(gid)) || {};
                        const typePriority = getSportMainMarketTypePriority(meta?.sport_name);
                        const picked = tryPickOdds(embedded, typePriority);
                        if (!picked) continue;
                        const { market, oddsArr } = picked;

                        const fp = getOddsFp(market);
                        if (!fp) continue;
                        if (fp === prevFpByGame.get(String(gid))) continue;

                        nextFpByGame.set(String(gid), fp);
                        lastOddsByGame.set(String(gid), oddsArr);
                        updates[String(gid)] = oddsArr;
                    }
                }
            }

            st.lastFpByGame = nextFpByGame;
            st.lastOddsByGame = lastOddsByGame;
            st.lastFetchAt = Date.now();
            return updates;
        } catch (e) {
            console.error('Failed to fetch upcoming odds:', e?.message || e);
            return null;
        } finally {
            st.inFlight = false;
        }
    };

    app.get('/api/upcoming-stream', async (req, res) => {
        const hours = Math.min(Math.max(parseInt(req.query.hours) || 2, 1), 24);

        let oddsRetryTimeoutId = null;

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders();

        const clientId = Date.now() + Math.random();

        // Track client
        if (!clientsByHours.has(hours)) clientsByHours.set(hours, new Set());
        clientsByHours.get(hours).add(clientId);

        const sendEvent = (event, data) => {
            res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        };

        // Get or create subscription for this hours value
        let sub = upcomingSubscriptions.get(hours);
        if (!sub) {
            try {
                sub = await scraper.subscribeToUpcoming(hours, (fullData, delta) => {
                    // Broadcast to all clients with this hours value
                    // Delta updates handled below
                });
                upcomingSubscriptions.set(hours, sub);
            } catch (err) {
                console.error('Failed to create upcoming subscription:', err.message);
                sendEvent('error', { message: 'Subscription failed' });
                res.end();
                return;
            }
        }

        // Send initial data
        const initialData = sub.getData();
        const games = flattenGames(initialData);
        sendEvent('games', { games, count: games.length });
        const { counts, totalGames } = calculateCounts(initialData);
        if (counts) {
            sendEvent('counts', { sports: counts, total_games: totalGames });
        }

        const cachedSnapshot = getCachedOddsSnapshotForGames(hours, games);
        if (cachedSnapshot && Object.keys(cachedSnapshot).length > 0) {
            sendEvent('odds', cachedSnapshot);
        }

        fetchOddsUpdatesForGames(hours, games)
            .then((updates) => {
                if (updates === null) {
                    oddsRetryTimeoutId = setTimeout(() => {
                        oddsRetryTimeoutId = null;
                        fetchOddsUpdatesForGames(hours, games)
                            .then((nextUpdates) => {
                                if (nextUpdates && Object.keys(nextUpdates).length > 0) {
                                    sendEvent('odds', nextUpdates);
                                }
                            })
                            .catch(() => {});
                    }, ODDS_THROTTLE_MS + 250);
                    return;
                }
                if (updates && Object.keys(updates).length > 0) {
                    sendEvent('odds', updates);
                }
            })
            .catch(() => {});

        // Add listener for updates
        const listener = (fullData, delta) => {
            const games = flattenGames(fullData);
            sendEvent('games', { games, count: games.length });

            fetchOddsUpdatesForGames(hours, games)
                .then((updates) => {
                    if (updates && Object.keys(updates).length > 0) {
                        sendEvent('odds', updates);
                    }
                })
                .catch(() => {});

            const { counts, totalGames } = calculateCounts(fullData);
            if (counts) {
                sendEvent('counts', { sports: counts, total_games: totalGames });
            }
        };
        sub.addListener(listener);

        // Keepalive
        const keepalive = setInterval(() => {
            res.write(': keepalive\n\n');
        }, 15000);

        // Cleanup on disconnect
        req.on('close', () => {
            clearInterval(keepalive);
            if (oddsRetryTimeoutId) {
                clearTimeout(oddsRetryTimeoutId);
                oddsRetryTimeoutId = null;
            }
            clientsByHours.get(hours)?.delete(clientId);

            // Cleanup subscription if no clients
            if (clientsByHours.get(hours)?.size === 0) {
                setTimeout(() => {
                    if (clientsByHours.get(hours)?.size === 0) {
                        const s = upcomingSubscriptions.get(hours);
                        if (s) {
                            s.unsubscribe();
                            upcomingSubscriptions.delete(hours);
                            console.log(`Upcoming subscription (${hours}h) cleaned up`);
                        }
                        oddsStateByHours.delete(String(hours));
                    }
                }, 30000);
            }
        });
    });

    function calculateCounts(data) {
        const counts = [];
        let totalGames = 0;
        if (!data?.sport) return { counts, totalGames };
    
        for (const sport of Object.values(data.sport)) {
            let sportGameCount = 0;
            for (const region of Object.values(sport?.region || {})) {
                for (const comp of Object.values(region?.competition || {})) {
                    sportGameCount += Object.keys(comp?.game || {}).length;
                }
            }
    
            if (sportGameCount > 0) {
                counts.push({ name: sport.name, count: sportGameCount });
                totalGames += sportGameCount;
            }
        }
        return { counts, totalGames };
    }

    function flattenGames(data) {
        const games = [];
        if (!data?.sport) return games;

        for (const sport of Object.values(data.sport)) {
            for (const region of Object.values(sport?.region || {})) {
                for (const comp of Object.values(region?.competition || {})) {
                    for (const game of Object.values(comp?.game || {})) {
                        games.push({
                            ...game,
                            sport_name: sport.name,
                            sport_alias: sport.alias || game.sport_alias,
                            sport_id: sport.id,
                            region_name: region.name,
                            region_id: region.id,
                            competition_name: comp.name,
                            competition_id: comp.id
                        });
                    }
                }
            }
        }

        // Sort by start time
        games.sort((a, b) => (a.start_ts || 0) - (b.start_ts || 0));
        return games;
    }

    function extractOddsFromGames(data) {
        const odds = {};
        if (!data?.sport) return odds;

        for (const sport of Object.values(data.sport)) {
            const typePriority = ['P1XP2', 'W1XW2', '1X2', 'P1P2', 'W1W2'];
            for (const region of Object.values(sport?.region || {})) {
                for (const comp of Object.values(region?.competition || {})) {
                    for (const [gameId, game] of Object.entries(comp?.game || {})) {
                        if (game?.market) {
                            const market = pickPreferredMarketFromEmbedded(game.market, typePriority);
                            if (market) {
                                const arr = buildOddsArrFromMarket(market);
                                if (arr) odds[gameId] = arr;
                            }
                        }
                    }
                }
            }
        }
        return odds;
    }
}

module.exports = { registerUpcomingStreamRoute };
