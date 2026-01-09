function registerHierarchyRoutes(app, { scraper, hierarchyCache, cacheKey }) {
    app.get('/api/hierarchy', async (req, res) => {
        try {
            const forceRefresh = req.query.refresh === 'true';

            if (!forceRefresh) {
                const cachedHierarchy = hierarchyCache.get(cacheKey);
                if (cachedHierarchy && cachedHierarchy.sport && Object.keys(cachedHierarchy.sport).length > 0) {
                    return res.json({
                        ...cachedHierarchy,
                        cached: true
                    });
                }
            }

            console.log('Fetching fresh hierarchy from Forzza API...');
            const hierarchy = await scraper.getHierarchy();

            if (hierarchy && hierarchy.sport && Object.keys(hierarchy.sport).length > 0) {
                hierarchyCache.set(cacheKey, hierarchy);
                console.log(`Cached hierarchy with ${Object.keys(hierarchy.sport).length} sports`);
            } else {
                console.warn('Hierarchy returned empty or invalid data:', JSON.stringify(hierarchy).slice(0, 200));
            }

            res.json({
                ...hierarchy,
                cached: false
            });
        } catch (error) {
            console.error('Hierarchy error:', error.message);
            res.status(500).json({ error: error.message });
        }
    });
}

module.exports = { registerHierarchyRoutes };
