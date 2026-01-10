const { unwrapSwarmData } = require('../lib/swarm/unwrap');

function registerDebugRoutes(app, { scraper, requireAdmin }) {
    // Debug endpoint to inspect market/event fields (for blocked/suspended status)
    app.get('/api/debug-market-fields', async (req, res) => {
        const { gameId } = req.query;
        if (!gameId) {
            return res.status(400).json({ error: 'gameId required' });
        }
        try {
            // Fetch markets with ALL available fields
            const rawData = await scraper.sendRequest('get', {
                source: 'betting',
                what: {
                    market: [], // Empty array = request ALL fields
                    event: []   // Empty array = request ALL fields
                },
                where: {
                    game: { id: parseInt(gameId) }
                }
            }, 60000);

            const data = unwrapSwarmData(rawData);
            
            let sampleMarket = null;
            let sampleEvent = null;
            
            if (data?.market) {
                const marketIds = Object.keys(data.market);
                if (marketIds.length > 0) {
                    sampleMarket = data.market[marketIds[0]];
                    // Get an event from this market
                    if (sampleMarket?.event) {
                        const eventIds = Object.keys(sampleMarket.event);
                        if (eventIds.length > 0) {
                            sampleEvent = sampleMarket.event[eventIds[0]];
                        }
                    }
                }
            }

            res.json({
                totalMarkets: data?.market ? Object.keys(data.market).length : 0,
                marketFields: sampleMarket ? Object.keys(sampleMarket) : [],
                sampleMarket: sampleMarket,
                eventFields: sampleEvent ? Object.keys(sampleEvent) : [],
                sampleEvent: sampleEvent,
                // Check for blocked/suspended fields across all markets
                blockedMarkets: data?.market ? Object.values(data.market).filter(m => m.is_blocked || m.is_suspended).length : 0,
                blockedEvents: data?.market ? Object.values(data.market).reduce((count, m) => {
                    if (!m.event) return count;
                    return count + Object.values(m.event).filter(e => e.is_blocked || e.is_suspended).length;
                }, 0) : 0
            });
        } catch (error) {
            console.error('Debug market fields error:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // Debug endpoint to inspect full game data structure (including stats, info, etc.)
    // No auth required for debugging - remove in production if needed
    app.get('/api/debug-game-fields', async (req, res) => {
        const { gameId, sportId } = req.query;
        try {
            // Fetch a single game with ALL available fields
            const rawData = await scraper.sendRequest('get', {
                source: 'betting',
                what: {
                    game: [] // Empty array = request ALL fields
                },
                where: gameId 
                    ? { game: { id: parseInt(gameId) } }
                    : { sport: { id: parseInt(sportId || 1) }, game: { type: 1 } } // Live games
            }, 60000);

            const data = unwrapSwarmData(rawData);
            
            // Get first game to show structure
            let sampleGame = null;
            if (data?.game) {
                const gameIds = Object.keys(data.game);
                if (gameIds.length > 0) {
                    sampleGame = data.game[gameIds[0]];
                }
            }

            res.json({
                totalGames: data?.game ? Object.keys(data.game).length : 0,
                sampleGameFields: sampleGame ? Object.keys(sampleGame) : [],
                sampleGame: sampleGame,
                infoFields: sampleGame?.info ? Object.keys(sampleGame.info) : [],
                statsFields: sampleGame?.stats ? Object.keys(sampleGame.stats) : [],
                rawDataKeys: Object.keys(data || {})
            });
        } catch (error) {
            console.error('Debug game fields error:', error);
            res.status(500).json({ error: error.message });
        }
    });

    app.get('/api/debug-games', requireAdmin, async (req, res) => {
        const { sportId } = req.query;
        try {
            console.log('Debug: Forcing scraper reconnection...');
            await scraper.init();
            console.log('Debug: Scraper reconnected, session:', scraper.sessionId);

            console.log('Debug: Fetching games for sport', sportId || 1);
            const rawData = await scraper.sendRequest('get', {
                source: 'betting',
                what: {
                    region: ['id', 'name'],
                    competition: ['id', 'name', 'favorite', 'teams_reversed'],
                    game: ['id', 'team1_name', 'team2_name', 'start_ts', 'type']
                },
                where: {
                    sport: { id: parseInt(sportId || 1) }
                }
            }, 60000);

            console.log('Debug: Raw response keys:', Object.keys(rawData || {}));
            console.log('Debug: rawData.data keys:', Object.keys(rawData?.data || {}));

            const data = unwrapSwarmData(rawData);

            const typeCount = {};
            const competitionsByType = {};

            if (data && data.region) {
                for (const regionId in data.region) {
                    const region = data.region[regionId];
                    if (region.competition) {
                        for (const compId in region.competition) {
                            const competition = region.competition[compId];
                            if (competition.game) {
                                for (const gameId in competition.game) {
                                    const game = competition.game[gameId];
                                    const type = game.type ?? 'undefined';
                                    typeCount[type] = (typeCount[type] || 0) + 1;

                                    if (!competitionsByType[type]) competitionsByType[type] = new Set();
                                    competitionsByType[type].add(competition.name);
                                }
                            }
                        }
                    }
                }
            }

            const competitionsByTypeArray = {};
            for (const type in competitionsByType) {
                competitionsByTypeArray[type] = Array.from(competitionsByType[type]).slice(0, 10);
            }

            res.json({
                sessionId: scraper.sessionId,
                gameTypeDistribution: typeCount,
                totalGames: Object.values(typeCount).reduce((a, b) => a + b, 0),
                competitionsByType: competitionsByTypeArray,
                rawDataKeys: Object.keys(data || {}),
                rawResponseKeys: Object.keys(rawData || {})
            });
        } catch (error) {
            console.error('Debug endpoint error:', error);
            res.status(500).json({ error: error.message, stack: error.stack });
        }
    });
}

module.exports = { registerDebugRoutes };
