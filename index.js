const express = require('express');
const mongoose = require('mongoose');
require('dotenv').config();
const ForzzaScraper = process.env.WORKER_TYPE === 'http' 
  ? require('./scraperProxy') 
  : require('./scraper');
const Game = require('./models/Game');
const CacheManager = require('./utils/CacheManager');
const PaginationHelper = require('./utils/PaginationHelper');
const QueryOptimizer = require('./utils/QueryOptimizer');
const RateLimitedScraper = require('./utils/RateLimitedScraper');
const { createCompressionMiddleware } = require('./middleware/compression');
const { createResponseTimerMiddleware, getMetrics } = require('./middleware/responseTimer');
const { requireAdmin, requireAdminIfConfigured } = require('./lib/admin');
const { noStore } = require('./lib/http');
const { pickMainMarket } = require('./lib/markets');
const { parseGamesFromData } = require('./lib/parseGamesFromData');
const { createSaveSportData } = require('./lib/saveSportData');

const { registerHierarchyRoutes } = require('./routes/hierarchy');
const { registerMarketRoutes } = require('./routes/markets');
const { registerLiveCountRoutes, getCountsStreamMetrics } = require('./routes/liveCounts');
const { registerScrapeRoutes } = require('./routes/scrape');
const { registerDebugRoutes } = require('./routes/debug');
const { registerHealthRoutes } = require('./routes/health');
const { registerStatsRoutes } = require('./routes/stats');
const { registerLiveTrackerRoutes } = require('./routes/liveTracker');
const { registerLiveStreamRoutes } = require('./routes/liveStream');
const { registerResultsRoutes } = require('./routes/results');
const { registerPrematchStreamRoutes } = require('./routes/prematchStream');
const { registerBoostedRoutes } = require('./routes/boosted');

const app = express();
app.set('etag', false);
const port = process.env.PORT || 3000;

// Track server start time for uptime calculation
const serverStartTime = Date.now();

// Initialize cache manager with 5 minute TTL (300000ms)
const hierarchyCache = new CacheManager(300000);
const HIERARCHY_CACHE_KEY = 'hierarchy';

// Apply compression middleware globally (compresses responses > 1KB)
// Requirements: 4.1, 4.2, 4.3
app.use(createCompressionMiddleware({ threshold: 1024 }));

// Apply response timer middleware globally (logs warnings for responses > 5 seconds)
// Requirements: 6.1, 6.2
app.use(createResponseTimerMiddleware({ warnThresholdMs: 5000 }));

// Serve static files from public directory
app.use(express.static('public'));

// MongoDB Connection
const mongoUri = process.env.MONGODB_URI;
if (mongoUri) {
    mongoose.connect(mongoUri)
        .then(() => console.log('Connected to MongoDB Atlas'))
        .catch(err => console.error('MongoDB connection error:', err));
} else {
    console.warn('MONGODB_URI not found. Running without persistent storage.');
}

const scraper = new ForzzaScraper();

const saveSportData = createSaveSportData({ mongoUri, QueryOptimizer });

registerHierarchyRoutes(app, { scraper, hierarchyCache, cacheKey: HIERARCHY_CACHE_KEY });
registerMarketRoutes(app, { scraper, noStore, pickMainMarket });
registerLiveCountRoutes(app, { scraper, noStore });
registerLiveStreamRoutes(app, { scraper, noStore, parseGamesFromData });
registerPrematchStreamRoutes(app, { scraper, noStore, parseGamesFromData });
registerLiveTrackerRoutes(app);
registerResultsRoutes(app, { scraper, noStore });
registerBoostedRoutes(app, { scraper, noStore });
registerScrapeRoutes(app, {
    scraper,
    noStore,
    requireAdminIfConfigured,
    parseGamesFromData,
    saveSportData,
    RateLimitedScraper
});

// Debug endpoint - Check what game types are returned (no filter)
registerDebugRoutes(app, { scraper, requireAdmin });
registerStatsRoutes(app);

// Health endpoint - Returns cache statistics, response time metrics, and uptime
// Requirements: 6.3
registerHealthRoutes(app, {
    hierarchyCache,
    serverStartTime,
    getMetrics,
    getCountsStreamMetrics,
    getSwarmWsMetrics: () => scraper.getWebSocketHealthMetrics()
});

app.listen(port, async () => {
    console.log(`Server running at http://localhost:${port}`);
    
    // Only init scraper directly in non-cluster mode
    if (process.env.WORKER_TYPE !== 'http') {
        try {
            await scraper.init();
            console.log('Scraper initialized and connected to Swarm API');
        } catch (error) {
            console.error('Failed to initialize scraper:', error.message);
        }
    }

    // Keep-alive ping (only in production)
    if (process.env.NODE_ENV === 'production') {
        setInterval(async () => {
            try {
                const response = await fetch(`https://dob-lqpg.onrender.com/api/health`);
                console.log(`Keep-alive ping: ${response.status}`);
            } catch (error) {
                console.log('Keep-alive ping failed:', error.message);
            }
        }, 14 * 60 * 1000); // Every 14 minutes
    }
});

// Export for testing and health endpoint access
module.exports = { app, hierarchyCache, serverStartTime };
