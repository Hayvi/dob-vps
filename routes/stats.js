const { fetchGameStats } = require('../lib/statsProvider');

function registerStatsRoutes(app) {
    app.get('/api/game-stats', async (req, res) => {
        const { gameId } = req.query;
        if (!gameId) {
            return res.status(400).json({ error: 'gameId is required' });
        }

        try {
            const stats = await fetchGameStats(gameId);
            res.json(stats);
        } catch (error) {
            if (error.message.toLowerCase().includes('not configured')) {
                return res.status(501).json({ error: 'Stats provider not configured' });
            }
            if (error.message.includes('not found')) {
                return res.status(404).json({ error: error.message });
            }
            res.status(500).json({ error: 'Failed to fetch stats' });
        }
    });
}

module.exports = { registerStatsRoutes };
