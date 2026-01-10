/**
 * Boosted/Enhanced Odds API routes
 */

function registerBoostedRoutes(app, { scraper, noStore }) {
    // Get all boosted selections
    app.get('/api/boosted-selections', async (req, res) => {
        try {
            noStore(res);
            const boosted = await scraper.getBoostedSelections();
            
            // Transform to array format with game info
            const games = [];
            for (const [gameId, selections] of Object.entries(boosted)) {
                if (Array.isArray(selections) && selections.length > 0) {
                    games.push({
                        gameId: parseInt(gameId),
                        sportId: selections[0]?.SportId,
                        selections: selections.map(s => ({
                            id: s.Id,
                            name: s.Name,
                            boostType: s.BoostType,
                            premiumOnly: s.BoostPrmOnly
                        }))
                    });
                }
            }
            
            res.json({
                count: games.length,
                server_ts: Date.now(),
                games
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get boosted event IDs (for quick lookup)
    app.get('/api/boosted-event-ids', async (req, res) => {
        try {
            noStore(res);
            const boosted = await scraper.getBoostedSelections();
            
            // Extract unique event IDs
            const eventIds = new Set();
            for (const selections of Object.values(boosted)) {
                if (Array.isArray(selections)) {
                    for (const s of selections) {
                        if (s.Id) eventIds.add(s.Id);
                    }
                }
            }
            
            res.json({
                count: eventIds.size,
                server_ts: Date.now(),
                eventIds: Array.from(eventIds)
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });
}

module.exports = { registerBoostedRoutes };
