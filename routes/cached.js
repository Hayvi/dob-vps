function registerCachedRoutes(app, { mongoUri, PaginationHelper, QueryOptimizer }) {
    app.get('/api/cached-sports', async (req, res) => {
        try {
            if (!mongoUri) return res.status(501).json({ error: 'MongoDB not configured' });

            const { sports, totalGames } = await QueryOptimizer.getLatestCountsBySport({ type: { $in: [0, 2] } });

            res.json({
                source: 'mongodb',
                count: sports.length,
                total_games: totalGames,
                sports
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    app.get('/api/football-games', async (req, res) => {
        try {
            if (!mongoUri) return res.status(501).json({ error: 'MongoDB not configured' });

            const paginationParams = PaginationHelper.parseParams(req.query);

            const { games, total, lastUpdated } = await QueryOptimizer.getLatestGamesBySport(
                'Football',
                paginationParams,
                { type: { $in: [0, 2] } }
            );

            if (!lastUpdated) {
                return res.status(404).json({ error: 'No football data found.' });
            }

            const paginationMetadata = PaginationHelper.buildMetadata(
                total,
                paginationParams.limit,
                paginationParams.skip
            );

            res.json({
                source: 'mongodb',
                sport: 'Football',
                last_updated: lastUpdated,
                pagination: paginationMetadata,
                count: games.length,
                data: games
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    app.get('/api/sport-games', async (req, res) => {
        const { sportName } = req.query;
        if (!sportName) return res.status(400).json({ error: 'sportName is required' });

        try {
            if (!mongoUri) return res.status(501).json({ error: 'MongoDB not configured' });

            const all = String(req.query.all || '').toLowerCase() === 'true';

            const paginationParams = PaginationHelper.parseParams(req.query);

            const exactSportName = await QueryOptimizer.findExactSportName(sportName);
            if (!exactSportName) {
                return res.status(404).json({ error: `No data found for ${sportName}` });
            }

            if (all) {
                const maxDocs = parseInt(req.query.maxDocs, 10);
                const safeMaxDocs = Number.isFinite(maxDocs) && maxDocs > 0 ? Math.min(maxDocs, 5000) : 5000;

                const { games, total, lastUpdated, truncated } = await QueryOptimizer.getAllLatestGamesBySport(
                    exactSportName,
                    safeMaxDocs,
                    { type: { $in: [0, 2] } }
                );

                if (!lastUpdated) {
                    return res.status(404).json({ error: `No data found for ${sportName}` });
                }

                res.json({
                    source: 'mongodb',
                    sport: exactSportName,
                    last_updated: lastUpdated,
                    returned_count: games.length,
                    truncated: Boolean(truncated),
                    pagination: {
                        total,
                        limit: games.length,
                        skip: 0,
                        hasMore: false,
                        page: 1
                    },
                    data: games
                });
                return;
            }

            const { games, total, lastUpdated } = await QueryOptimizer.getLatestGamesBySport(
                exactSportName,
                paginationParams,
                { type: { $in: [0, 2] } }
            );

            if (!lastUpdated) {
                return res.status(404).json({ error: `No data found for ${sportName}` });
            }

            const paginationMetadata = PaginationHelper.buildMetadata(
                total,
                paginationParams.limit,
                paginationParams.skip
            );

            res.json({
                source: 'mongodb',
                sport: exactSportName,
                last_updated: lastUpdated,
                pagination: paginationMetadata,
                count: games.length,
                data: games
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });
}

module.exports = { registerCachedRoutes };
