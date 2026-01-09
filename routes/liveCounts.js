const { extractSportsCountsFromSwarm, normalizeSwarmResponse } = require('../lib/liveCounts/swarmCounts');
const { safeWrite, safePing } = require('../lib/liveStream/sse');
const { getCountsFp } = require('../lib/liveStream/fingerprints');

const countsStreamMetrics = {
    runsTotal: 0,
    runsByReason: {},
    attemptsTotal: 0,
    attemptsByReason: {},
    skippedNoClients: 0,
    skippedInFlight: 0,
    lastRunAt: 0,
    lastReason: null,
    runsTimestampsMs: []
};

function getCountsStreamMetrics() {
    const now = Date.now();
    const ts = Array.isArray(countsStreamMetrics.runsTimestampsMs)
        ? countsStreamMetrics.runsTimestampsMs
        : [];
    const last60s = ts.filter(t => Number.isFinite(t) && (now - t) <= 60000).length;
    return {
        runs_total: countsStreamMetrics.runsTotal,
        runs_by_reason: countsStreamMetrics.runsByReason,
        attempts_total: countsStreamMetrics.attemptsTotal,
        attempts_by_reason: countsStreamMetrics.attemptsByReason,
        skipped_no_clients: countsStreamMetrics.skippedNoClients,
        skipped_in_flight: countsStreamMetrics.skippedInFlight,
        last_run_at: countsStreamMetrics.lastRunAt ? new Date(countsStreamMetrics.lastRunAt).toISOString() : null,
        last_reason: countsStreamMetrics.lastReason,
        runs_last_60s: last60s
    };
}

function registerLiveCountRoutes(app, { scraper, noStore }) {
    let liveSportsCache = null;
    let liveSportsCacheExpiresAt = 0;

    let prematchSportsCache = null;
    let prematchSportsCacheExpiresAt = 0;

    // SSE counts stream
    const countsClients = new Set();
    let countsIntervalId = null;
    let countsInFlight = false;
    let lastLiveCountsFp = null;
    let lastPrematchCountsFp = null;

    let liveCountSubscription = null;
    let prematchCountSubscription = null;
    let usingCountSubscriptions = false;
    let subscriptionStartInFlight = false;
    let refreshDebounceId = null;
    let subscriptionsWatchdogId = null;

    const recordAttempt = (reason) => {
        countsStreamMetrics.attemptsTotal += 1;
        const r = String(reason || 'unknown');
        countsStreamMetrics.attemptsByReason[r] = (countsStreamMetrics.attemptsByReason[r] || 0) + 1;
    };

    const recordRun = (reason) => {
        countsStreamMetrics.runsTotal += 1;
        const r = String(reason || 'unknown');
        countsStreamMetrics.runsByReason[r] = (countsStreamMetrics.runsByReason[r] || 0) + 1;
        countsStreamMetrics.lastReason = r;
        const now = Date.now();
        countsStreamMetrics.lastRunAt = now;
        countsStreamMetrics.runsTimestampsMs.push(now);
        if (countsStreamMetrics.runsTimestampsMs.length > 300) {
            countsStreamMetrics.runsTimestampsMs.splice(0, countsStreamMetrics.runsTimestampsMs.length - 300);
        }
    };

    const fetchAndBroadcastCounts = async (reason = 'unknown') => {
        recordAttempt(reason);
        if (countsClients.size === 0) {
            countsStreamMetrics.skippedNoClients += 1;
            return;
        }
        if (countsInFlight) {
            countsStreamMetrics.skippedInFlight += 1;
            return;
        }
        countsInFlight = true;

        recordRun(reason);
        
        try {
            // Fetch live counts
            const rawLiveData = await scraper.sendRequest('get', {
                source: 'betting',
                what: { sport: ['id', 'name'], game: ['id'] },
                where: { game: { type: { '@in': [1] } } }
            });
            
            const { sports: liveSports, totalGames: liveTotalGames } = extractSportsCountsFromSwarm(rawLiveData);
            const liveFp = getCountsFp(liveSports);
            const liveChanged = liveFp !== lastLiveCountsFp;
            
            if (liveChanged) {
                lastLiveCountsFp = liveFp;
                const payload = {
                    source: 'swarm',
                    count: liveSports.length,
                    total_games: liveTotalGames,
                    sports: liveSports,
                    timestamp: new Date().toISOString()
                };
                for (const res of countsClients) safeWrite(res, 'live_counts', payload);
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
            
            const { sports: prematchSports, totalGames: prematchTotalGames } = extractSportsCountsFromSwarm(rawPrematchData);
            const prematchFp = getCountsFp(prematchSports);
            const prematchChanged = prematchFp !== lastPrematchCountsFp;
            
            if (prematchChanged) {
                lastPrematchCountsFp = prematchFp;
                const payload = {
                    source: 'swarm',
                    count: prematchSports.length,
                    total_games: prematchTotalGames,
                    sports: prematchSports,
                    timestamp: new Date().toISOString()
                };
                for (const res of countsClients) safeWrite(res, 'prematch_counts', payload);
            }
            
            // Ping if nothing changed
            if (!liveChanged && !prematchChanged) {
                for (const res of countsClients) safePing(res);
            }
        } catch (e) {
            console.error('Counts stream error:', e.message);
        } finally {
            countsInFlight = false;
        }
    };

    const scheduleCountsRefresh = () => {
        if (refreshDebounceId) return;
        refreshDebounceId = setTimeout(() => {
            refreshDebounceId = null;
            fetchAndBroadcastCounts('debounced');
        }, 350);
    };

    const stopCountSubscriptionsIfIdle = async () => {
        if (countsClients.size > 0) return;

        if (refreshDebounceId) {
            clearTimeout(refreshDebounceId);
            refreshDebounceId = null;
        }

        if (subscriptionsWatchdogId) {
            clearInterval(subscriptionsWatchdogId);
            subscriptionsWatchdogId = null;
        }

        if (liveCountSubscription && typeof liveCountSubscription.unsubscribe === 'function') {
            try {
                await liveCountSubscription.unsubscribe();
            } catch {
                // ignore
            }
        }
        if (prematchCountSubscription && typeof prematchCountSubscription.unsubscribe === 'function') {
            try {
                await prematchCountSubscription.unsubscribe();
            } catch {
                // ignore
            }
        }

        liveCountSubscription = null;
        prematchCountSubscription = null;
        usingCountSubscriptions = false;
        subscriptionStartInFlight = false;
    };

    const tryEnableCountSubscriptions = async () => {
        if (usingCountSubscriptions) return true;
        if (subscriptionStartInFlight) return false;
        subscriptionStartInFlight = true;

        try {
            const liveSub = await scraper.subscribeToLiveCount(() => {
                if (countsClients.size === 0) return;
                scheduleCountsRefresh();
            });

            const prematchSub = await scraper.subscribeToPrematchCount(() => {
                if (countsClients.size === 0) return;
                scheduleCountsRefresh();
            });

            if (!liveSub?.subid || !prematchSub?.subid) {
                if (liveSub?.unsubscribe) {
                    try { await liveSub.unsubscribe(); } catch { /* ignore */ }
                }
                if (prematchSub?.unsubscribe) {
                    try { await prematchSub.unsubscribe(); } catch { /* ignore */ }
                }
                return false;
            }

            liveCountSubscription = liveSub;
            prematchCountSubscription = prematchSub;
            usingCountSubscriptions = true;

            if (!subscriptionsWatchdogId) {
                subscriptionsWatchdogId = setInterval(() => {
                    if (!usingCountSubscriptions) return;
                    if (countsClients.size === 0) return;
                    fetchAndBroadcastCounts('watchdog');
                }, 15000);
            }

            if (countsIntervalId) {
                clearInterval(countsIntervalId);
                countsIntervalId = null;
            }

            fetchAndBroadcastCounts('subscription_start');
            return true;
        } catch (e) {
            return false;
        } finally {
            subscriptionStartInFlight = false;
        }
    };

    const startCountsInterval = () => {
        if (countsIntervalId) return;
        fetchAndBroadcastCounts('poll_start');
        countsIntervalId = setInterval(() => fetchAndBroadcastCounts('poll'), 1000);
    };

    const ensureCountsTransport = () => {
        if (usingCountSubscriptions || subscriptionStartInFlight) return;

        tryEnableCountSubscriptions().then((ok) => {
            if (!ok) startCountsInterval();
        });
    };

    const stopCountsIntervalIfIdle = () => {
        if (countsClients.size > 0) return;
        if (countsIntervalId) clearInterval(countsIntervalId);
        countsIntervalId = null;
        countsInFlight = false;
        lastLiveCountsFp = null;
        lastPrematchCountsFp = null;
    };

    app.get('/api/counts-stream', async (req, res) => {
        try {
            noStore(res);
            res.status(200);
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache, no-transform');
            res.setHeader('Connection', 'keep-alive');
            res.setHeader('X-Accel-Buffering', 'no');
            if (typeof res.flushHeaders === 'function') res.flushHeaders();

            countsClients.add(res);
            fetchAndBroadcastCounts('connect');
            ensureCountsTransport();

            const heartbeatId = setInterval(() => safePing(res), 15000);

            req.on('close', () => {
                clearInterval(heartbeatId);
                countsClients.delete(res);
                stopCountsIntervalIfIdle();
                Promise.resolve(stopCountSubscriptionsIfIdle()).catch(() => null);
            });
        } catch (e) {
            try {
                res.status(500).end();
            } catch {
                return;
            }
        }
    });

    app.get('/api/live-sports', async (req, res) => {
        try {
            noStore(res);

            const now = Date.now();
            if (liveSportsCache && liveSportsCacheExpiresAt > now) {
                const totalGames = Array.isArray(liveSportsCache)
                    ? liveSportsCache.reduce((sum, s) => sum + (Number(s?.count) || 0), 0)
                    : 0;
                return res.json({
                    source: 'swarm',
                    cached: true,
                    count: liveSportsCache.length,
                    total_games: totalGames,
                    sports: liveSportsCache,
                    timestamp: new Date().toISOString()
                });
            }

            const rawData = await scraper.sendRequest('get', {
                source: 'betting',
                what: { sport: ['id', 'name'], game: ['id'] },
                where: { game: { type: { '@in': [1] } } }
            });

            const { sports, totalGames } = extractSportsCountsFromSwarm(rawData);

            liveSportsCache = sports;
            liveSportsCacheExpiresAt = now + 60 * 1000;

            res.json({
                source: 'swarm',
                cached: false,
                count: sports.length,
                total_games: totalGames,
                sports,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    app.get('/api/prematch-sports', async (req, res) => {
        try {
            noStore(res);

            const now = Date.now();
            if (prematchSportsCache && prematchSportsCacheExpiresAt > now) {
                const totalGames = Array.isArray(prematchSportsCache)
                    ? prematchSportsCache.reduce((sum, s) => sum + (Number(s?.count) || 0), 0)
                    : 0;
                return res.json({
                    source: 'swarm',
                    cached: true,
                    count: prematchSportsCache.length,
                    total_games: totalGames,
                    sports: prematchSportsCache,
                    timestamp: new Date().toISOString()
                });
            }

            // Using Forzza's exact filter for prematch
            const rawData = await scraper.sendRequest('get', {
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

            const { sports, totalGames } = extractSportsCountsFromSwarm(rawData);

            prematchSportsCache = sports;
            prematchSportsCacheExpiresAt = now + 60 * 1000;

            res.json({
                source: 'swarm',
                cached: false,
                count: sports.length,
                total_games: totalGames,
                sports,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    app.get('/api/football-games-count', async (req, res) => {
        try {
            noStore(res);
            const rawData = await scraper.sendRequest('get', {
                source: 'betting',
                what: { sport: ['id', 'name'], game: ['id'] },
                where: { sport: { id: 1 }, game: { type: { '@in': [0, 1, 2] } } }
            });
            const data = normalizeSwarmResponse(rawData);
            let count = 0;
            let sportName = "Football";
            if (data && data.sport) {
                const sports = Object.values(data.sport);
                if (sports.length > 0) {
                    sportName = sports[0].name || sportName;
                    if (sports[0].game) count = Object.keys(sports[0].game).length;
                }
            }
            res.json({ sport: sportName, count: count, timestamp: new Date().toISOString() });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    app.get('/api/sport-games-count', async (req, res) => {
        const { sportName } = req.query;
        if (!sportName) return res.status(400).json({ error: 'sportName is required' });

        try {
            noStore(res);
            const rawHierarchy = await scraper.getHierarchy();
            const hierarchy = rawHierarchy.data || rawHierarchy;
            const sports = hierarchy.sport || (hierarchy.data ? hierarchy.data.sport : null);

            let sportId = null;
            if (sports) {
                for (const id in sports) {
                    if (sports[id].name.toLowerCase() === sportName.toLowerCase()) {
                        sportId = id;
                        break;
                    }
                }
            }

            if (!sportId) {
                return res.status(404).json({ error: `Sport ${sportName} not found in hierarchy.` });
            }

            const rawData = await scraper.sendRequest('get', {
                source: 'betting',
                what: { sport: ['id', 'name'], game: ['id'] },
                where: {
                    sport: { id: parseInt(sportId) },
                    game: { type: { '@in': [0, 1, 2] } }
                }
            });

            const data = rawData.data && rawData.data.data ? rawData.data.data : (rawData.data || rawData);
            let count = 0;
            let foundName = sportName;

            if (data && data.sport) {
                const sportsData = Object.values(data.sport);
                if (sportsData.length > 0) {
                    foundName = sportsData[0].name || foundName;
                    if (sportsData[0].game) count = Object.keys(sportsData[0].game).length;
                }
            }

            res.json({ sport: foundName, count: count, timestamp: new Date().toISOString() });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });
}

module.exports = { registerLiveCountRoutes, getCountsStreamMetrics };
