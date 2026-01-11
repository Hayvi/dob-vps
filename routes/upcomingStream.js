const { buildOddsArrFromMarket, pickPreferredMarketFromEmbedded } = require('../lib/liveStream/odds');

function registerUpcomingStreamRoute(app, { scraper }) {
    // Active subscriptions per hours value
    const upcomingSubscriptions = new Map();
    const clientsByHours = new Map();

    app.get('/api/upcoming-stream', async (req, res) => {
        const hours = Math.min(Math.max(parseInt(req.query.hours) || 2, 1), 24);

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

        // Add listener for updates
        const listener = (fullData, delta) => {
            const games = flattenGames(fullData);
            const odds = extractOddsFromGames(fullData);
            sendEvent('games', { games, count: games.length });
            if (Object.keys(odds).length > 0) {
                sendEvent('odds', odds);
            }
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
