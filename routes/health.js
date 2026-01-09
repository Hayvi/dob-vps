function registerHealthRoutes(app, { hierarchyCache, serverStartTime, getMetrics, getCountsStreamMetrics, getSwarmWsMetrics }) {
    app.get('/api/health', (req, res) => {
        const uptimeMs = Date.now() - serverStartTime;
        const uptimeSeconds = Math.floor(uptimeMs / 1000);

        res.json({
            status: 'healthy',
            uptime: uptimeSeconds,
            cache: hierarchyCache.getStats(),
            responseTime: getMetrics(),
            counts_stream: typeof getCountsStreamMetrics === 'function' ? getCountsStreamMetrics() : null,
            swarm_ws: typeof getSwarmWsMetrics === 'function' ? getSwarmWsMetrics() : null
        });
    });
}

module.exports = { registerHealthRoutes };
