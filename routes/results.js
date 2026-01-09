/**
 * Results API routes - fetch finished game results from Forzza
 */

function registerResultsRoutes(app, { scraper, noStore }) {
    /**
     * GET /api/results/competitions
     * Get competitions that have results available within a date range
     * Query params:
     *   - from: Unix timestamp (optional, defaults to start of today)
     *   - to: Unix timestamp (optional, defaults to end of today)
     */
    app.get('/api/results/competitions', async (req, res) => {
        try {
            noStore(res);
            const from = req.query.from ? parseInt(req.query.from) : undefined;
            const to = req.query.to ? parseInt(req.query.to) : undefined;

            const data = await scraper.getActiveCompetitions(from, to);
            res.json({
                success: true,
                data: data?.details || data,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    /**
     * GET /api/results/games/:sportId
     * Get finished games with scores for a sport within a date range
     * Params:
     *   - sportId: Sport ID (1=Football, etc.)
     * Query params:
     *   - from: Unix timestamp (optional, defaults to start of today)
     *   - to: Unix timestamp (optional, defaults to end of today)
     */
    app.get('/api/results/games/:sportId', async (req, res) => {
        try {
            noStore(res);
            const { sportId } = req.params;
            const from = req.query.from ? parseInt(req.query.from) : undefined;
            const to = req.query.to ? parseInt(req.query.to) : undefined;

            const games = await scraper.getResultGames(sportId, from, to);
            res.json({
                success: true,
                sportId: parseInt(sportId),
                count: games.length,
                games,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    /**
     * GET /api/results/game/:gameId
     * Get detailed results (market settlements) for a specific game
     * Params:
     *   - gameId: Game ID
     */
    app.get('/api/results/game/:gameId', async (req, res) => {
        try {
            noStore(res);
            const { gameId } = req.params;

            const results = await scraper.getGameResults(gameId);
            
            // Parse the lines into a cleaner format
            const settlements = [];
            if (results?.lines?.line) {
                for (const line of results.lines.line) {
                    settlements.push({
                        market: line.line_name,
                        winners: line.events?.event_name || []
                    });
                }
            }

            res.json({
                success: true,
                gameId,
                settlements,
                raw: results,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });
}

module.exports = { registerResultsRoutes };
