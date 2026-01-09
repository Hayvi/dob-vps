const { resolveSportNameFromHierarchy, normalizeSportNameFromQuery } = require('../lib/scrape/sportName');
const { filterGamesByTypeParam, filterPrematchAndOutright } = require('../lib/scrape/gameFilters');

function registerScrapeRoutes(app, {
    scraper,
    noStore,
    requireAdminIfConfigured,
    parseGamesFromData,
    saveSportData,
    RateLimitedScraper
}) {
    app.get('/api/sport-full-scrape', requireAdminIfConfigured, async (req, res) => {
        const { sportId, sportName, type } = req.query; // type: 'live', 'prematch', 'all'
        if (!sportId || !sportName) {
            return res.status(400).json({ error: 'sportId and sportName are required' });
        }

        try {
            noStore(res);
            // We fetch all games first, then filter on server side to ensure consistency
            // (Swarm API filtering can be tricky with type, easier to fetch all and filter array)
            const rawData = await scraper.getGamesBySport(sportId);
            let actualSportName = normalizeSportNameFromQuery(sportName);
            actualSportName = await resolveSportNameFromHierarchy(scraper, sportId, actualSportName);

            let allGames = parseGamesFromData(rawData, actualSportName);
            allGames = filterGamesByTypeParam(allGames, type);

            let scrapeTime = null;
            if (!type || type === 'prematch') {
                scrapeTime = await saveSportData(actualSportName, allGames);
            } else {
                scrapeTime = new Date();
            }

            res.json({
                message: `Scrape completed for ${actualSportName}`,
                count: allGames.length,
                last_updated: scrapeTime,
                data: allGames,
                diagnostics: allGames.length === 0 ? {
                    rawKeys: Object.keys(rawData || {}),
                    rawDataKeys: Object.keys(rawData?.data || {}),
                    nestedDataKeys: Object.keys(rawData?.data?.data || {})
                } : undefined
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    app.get('/api/fetch-all-sports', requireAdminIfConfigured, async (req, res) => {
        try {
            noStore(res);
            console.log('Bulk scrape: Fetching fresh hierarchy...');
            const rawHierarchy = await scraper.getHierarchy();
            const hierarchy = rawHierarchy.data || rawHierarchy;
            console.log('Bulk scrape: Hierarchy keys:', Object.keys(hierarchy || {}));

            const summary = [];
            const errors = [];
            const progressLog = [];

            const sports = hierarchy.sport || (hierarchy.data ? hierarchy.data.sport : null);
            console.log('Bulk scrape: Sports found:', sports ? Object.keys(sports).length : 0);

            if (!sports || Object.keys(sports).length === 0) {
                return res.json({
                    message: "Bulk scrape completed - no sports found in hierarchy",
                    summary: [],
                    errors: [],
                    progress: { completed: 0, total: 0 },
                    count: 0,
                    timestamp: new Date().toISOString()
                });
            }

            const sportsArray = Object.entries(sports).map(([id, sport]) => ({
                id,
                name: sport.name
            }));

            const rateLimitedScraper = new RateLimitedScraper(scraper, {
                concurrency: 3,
                maxRetries: 2,
                retryDelayMs: 1000
            });

            const onProgress = (progress) => {
                console.log(`Progress: ${progress.completed}/${progress.total} - ${progress.current} (${progress.success ? 'success' : 'failed'})`);
                progressLog.push({
                    completed: progress.completed,
                    total: progress.total,
                    sport: progress.current,
                    success: progress.success,
                    timestamp: new Date().toISOString()
                });
            };

            const scrapeResults = await rateLimitedScraper.scrapeAll(sportsArray, onProgress);

            for (const result of scrapeResults.results) {
                try {
                    let games = parseGamesFromData(result.data, result.sportName);
                    games = filterPrematchAndOutright(games);
                    if (games.length > 0) {
                        await saveSportData(result.sportName, games);
                    }
                    summary.push({
                        sport: result.sportName,
                        id: result.sportId,
                        count: games.length,
                        attempts: result.attempts
                    });
                } catch (saveError) {
                    errors.push({
                        sport: result.sportName,
                        id: result.sportId,
                        error: `Save failed: ${saveError.message}`,
                        attempts: result.attempts
                    });
                }
            }

            for (const error of scrapeResults.errors) {
                errors.push({
                    sport: error.sportName,
                    id: error.sportId,
                    error: error.error,
                    attempts: error.attempts
                });
            }

            res.json({
                message: "Bulk scrape completed",
                summary,
                errors,
                progress: {
                    completed: scrapeResults.total,
                    total: scrapeResults.total,
                    successful: scrapeResults.successful,
                    failed: scrapeResults.failed
                },
                count: summary.length,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    app.get('/api/football-full-scrape', requireAdminIfConfigured, async (req, res) => {
        try {
            noStore(res);
            const rawData = await scraper.getGamesBySport(1);
            let allGames = parseGamesFromData(rawData, "Football");
            allGames = filterPrematchAndOutright(allGames);
            const scrapeTime = await saveSportData("Football", allGames);
            res.json({
                message: "Football scrape completed",
                count: allGames.length,
                last_updated: scrapeTime,
                data: allGames
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });
}

module.exports = { registerScrapeRoutes };
