/**
 * Time-filtered games API routes
 */

function registerTimeFilterRoutes(app, { scraper, noStore, parseGamesFromData }) {
    const { unwrapSwarmData } = require('../lib/swarm/unwrap');

    // Get games starting within a time range
    app.get('/api/games-by-time', async (req, res) => {
        try {
            noStore(res);
            const { sportId, from, to, hours } = req.query;
            
            const now = Math.floor(Date.now() / 1000);
            let fromTs = from ? parseInt(from) : now;
            let toTs = to ? parseInt(to) : null;
            
            // If hours provided, calculate toTs
            if (hours && !to) {
                toTs = fromTs + (parseInt(hours) * 3600);
            }
            
            // Default: next 24 hours
            if (!toTs) {
                toTs = fromTs + 86400;
            }

            const where = {
                game: {
                    type: 0, // Prematch only
                    start_ts: { '@gte': fromTs, '@lte': toTs }
                }
            };
            
            if (sportId) {
                where.sport = { id: parseInt(sportId) };
            }

            const raw = await scraper.sendRequest('get', {
                source: 'betting',
                what: {
                    sport: ['id', 'name'],
                    region: ['id', 'name'],
                    competition: ['id', 'name', 'order', 'favorite', 'favorite_order', 'teams_reversed'],
                    game: [
                        'id', 'team1_name', 'team2_name', 'start_ts', 'type',
                        'markets_count', 'strong_team', 'round', 'is_blocked'
                    ]
                },
                where
            });

            const data = unwrapSwarmData(raw);
            const games = [];
            
            // Extract games from nested structure
            if (data?.sport) {
                for (const sport of Object.values(data.sport)) {
                    if (sport?.region) {
                        for (const region of Object.values(sport.region)) {
                            if (region?.competition) {
                                for (const comp of Object.values(region.competition)) {
                                    if (comp?.game) {
                                        for (const game of Object.values(comp.game)) {
                                            games.push({
                                                ...game,
                                                sport: sport.name,
                                                region: region.name,
                                                competition: comp.name,
                                                competition_favorite: comp.favorite,
                                                teams_reversed: comp.teams_reversed
                                            });
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // Sort by start time
            games.sort((a, b) => (a.start_ts || 0) - (b.start_ts || 0));

            res.json({
                count: games.length,
                from: fromTs,
                to: toTs,
                server_ts: Date.now(),
                games
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Shortcut: Today's games
    app.get('/api/games-today', async (req, res) => {
        try {
            noStore(res);
            const { sportId } = req.query;
            
            const now = new Date();
            const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 1000;
            const endOfDay = startOfDay + 86400;

            const where = {
                game: {
                    type: 0,
                    start_ts: { '@gte': Math.floor(startOfDay), '@lte': Math.floor(endOfDay) }
                }
            };
            
            if (sportId) {
                where.sport = { id: parseInt(sportId) };
            }

            const raw = await scraper.sendRequest('get', {
                source: 'betting',
                what: {
                    sport: ['id', 'name'],
                    game: ['id', 'team1_name', 'team2_name', 'start_ts', 'type', 'markets_count']
                },
                where
            });

            const data = unwrapSwarmData(raw);
            let count = 0;
            const bySport = {};
            
            if (data?.sport) {
                for (const sport of Object.values(data.sport)) {
                    const sportGames = sport?.game ? Object.keys(sport.game).length : 0;
                    if (sportGames > 0) {
                        bySport[sport.name] = sportGames;
                        count += sportGames;
                    }
                }
            }

            res.json({
                count,
                date: now.toISOString().split('T')[0],
                server_ts: Date.now(),
                bySport
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Shortcut: Next N hours
    app.get('/api/games-next-hours/:hours', async (req, res) => {
        try {
            noStore(res);
            const hours = parseInt(req.params.hours) || 24;
            const { sportId } = req.query;
            
            const now = Math.floor(Date.now() / 1000);
            const toTs = now + (hours * 3600);

            const where = {
                game: {
                    type: 0,
                    start_ts: { '@gte': now, '@lte': toTs }
                }
            };
            
            if (sportId) {
                where.sport = { id: parseInt(sportId) };
            }

            const raw = await scraper.sendRequest('get', {
                source: 'betting',
                what: {
                    sport: ['id', 'name'],
                    game: ['id', 'team1_name', 'team2_name', 'start_ts', 'type', 'markets_count']
                },
                where
            });

            const data = unwrapSwarmData(raw);
            let count = 0;
            const bySport = {};
            
            if (data?.sport) {
                for (const sport of Object.values(data.sport)) {
                    const sportGames = sport?.game ? Object.keys(sport.game).length : 0;
                    if (sportGames > 0) {
                        bySport[sport.name] = sportGames;
                        count += sportGames;
                    }
                }
            }

            res.json({
                count,
                hours,
                from: now,
                to: toTs,
                server_ts: Date.now(),
                bySport
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });
}

module.exports = { registerTimeFilterRoutes };
