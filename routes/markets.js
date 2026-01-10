const { unwrapSwarmData } = require('../lib/swarm/unwrap');

function registerMarketRoutes(app, { scraper, noStore, pickMainMarket }) {
    app.get('/api/game-main-market', async (req, res) => {
        const { gameId } = req.query;
        if (!gameId) return res.status(400).json({ error: 'gameId is required' });

        try {
            noStore(res);
            const raw = await scraper.sendRequest('get', {
                source: 'betting',
                what: {
                    market: ['id', 'name', 'type', 'order', 'col_count', 'display_key', 'is_blocked', 'cashout', 'available_for_betbuilder', 'group_id', 'group_name', 'display_color'],
                    event: ['id', 'name', 'price', 'order', 'type', 'base', 'is_blocked', 'home_value', 'away_value', 'type_id']
                },
                where: {
                    game: { id: parseInt(gameId) }
                }
            });

            const data = unwrapSwarmData(raw);
            const marketsMap = data?.market || {};
            const markets = Object.values(marketsMap);
            const main = pickMainMarket(markets);

            res.json({
                gameId: parseInt(gameId),
                server_ts: Date.now(),
                markets_count: Object.keys(marketsMap).length,
                picked_market: main ? {
                    id: main.id,
                    name: main.name,
                    type: main.type,
                    order: main.order,
                    display_key: main.display_key,
                    is_blocked: main.is_blocked
                } : null,
                market: main || null
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    app.get('/api/game-details', async (req, res) => {
        const { gameId } = req.query;
        if (!gameId) return res.status(400).json({ error: 'gameId is required' });

        try {
            noStore(res);
            const raw = await scraper.sendRequest('get', {
                source: 'betting',
                what: {
                    market: ['id', 'name', 'type', 'order', 'col_count', 'display_key', 'is_blocked', 'cashout', 'available_for_betbuilder', 'group_id', 'group_name', 'display_color'],
                    event: ['id', 'name', 'price', 'order', 'type', 'base', 'is_blocked', 'home_value', 'away_value', 'type_id']
                },
                where: {
                    game: { id: parseInt(gameId) }
                }
            });

            const data = unwrapSwarmData(raw);
            res.json(data);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });
}

module.exports = { registerMarketRoutes };
