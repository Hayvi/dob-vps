function createSaveSportData({ mongoUri, QueryOptimizer }) {
    return async function saveSportData(sportName, games) {
        if (!mongoUri) {
            return null;
        }

        const result = await QueryOptimizer.bulkUpsertGames(games, sportName);
        return result.scrapeTimestamp;
    };
}

module.exports = { createSaveSportData };
