/**
 * QueryOptimizer - Optimized database query builders for the Forzza Scraper
 * 
 * Provides static methods for efficient database operations using:
 * - Aggregation pipelines instead of multiple queries
 * - Exact string matching instead of regex for sport lookups
 * - Bulk operations with parallel processing
 * 
 * Requirements: 3.1, 3.2, 3.3, 3.4
 */
const Game = require('../models/Game');

class QueryOptimizer {
  /**
   * Get latest games for a sport using a single aggregation pipeline
   * Uses exact string matching and the compound index (sport, last_updated)
   * 
   * @param {string} sportName - The sport name to query (exact match)
   * @param {{limit: number, skip: number}} pagination - Pagination parameters
   * @param {Object} [extraMatch={}] - Optional match filters
   * @returns {Promise<{games: Array, total: number, lastUpdated: Date|null}>} Games with metadata
   * 
   * Requirements: 3.1, 3.2, 3.4
   */
  static async getLatestGamesBySport(sportName, pagination = { limit: 100, skip: 0 }, extraMatch = {}) {
    const { limit, skip } = pagination;

    const match = { sport: sportName, ...(extraMatch || {}) };

    // Single aggregation pipeline that:
    // 1. Filters by exact sport name (uses index)
    // 2. Finds the latest update timestamp
    // 3. Filters to only games with that timestamp
    // 4. Applies pagination
    // 5. Returns total count
    const pipeline = [
      // Stage 1: Match by exact sport name (uses compound index)
      { $match: match },
      
      // Stage 2: Sort by last_updated descending to get latest first
      { $sort: { last_updated: -1 } },
      
      // Stage 3: Group to find the max last_updated timestamp
      {
        $group: {
          _id: null,
          latestTimestamp: { $first: '$last_updated' },
          allDocs: { $push: '$$ROOT' }
        }
      },
      
      // Stage 4: Unwind to get individual documents back
      { $unwind: '$allDocs' },
      
      // Stage 5: Filter to only documents with the latest timestamp
      {
        $match: {
          $expr: { $eq: ['$allDocs.last_updated', '$latestTimestamp'] }
        }
      },
      
      // Stage 6: Replace root with the original document
      { $replaceRoot: { newRoot: '$allDocs' } },
      
      // Stage 7: Facet to get both paginated results and total count
      {
        $facet: {
          metadata: [{ $count: 'total' }],
          data: [
            { $skip: skip },
            { $limit: limit }
          ]
        }
      }
    ];

    const result = await Game.aggregate(pipeline);
    
    // Extract results from facet
    const total = result[0]?.metadata[0]?.total || 0;
    const games = result[0]?.data || [];
    const lastUpdated = games.length > 0 ? games[0].last_updated : null;

    return {
      games,
      total,
      lastUpdated
    };
  }

  static async getAllLatestGamesBySport(sportName, maxDocs = 5000, extraMatch = {}) {
    const match = { sport: sportName, ...(extraMatch || {}) };

    const latestGame = await Game.findOne(match)
      .sort({ last_updated: -1 })
      .select('last_updated')
      .lean();

    if (!latestGame?.last_updated) {
      return {
        games: [],
        total: 0,
        lastUpdated: null,
        truncated: false
      };
    }

    const lastUpdated = latestGame.last_updated;

    const [games, total] = await Promise.all([
      Game.find({ ...match, last_updated: lastUpdated })
        .limit(maxDocs)
        .lean(),
      Game.countDocuments({ ...match, last_updated: lastUpdated })
    ]);

    return {
      games,
      total,
      lastUpdated,
      truncated: total > games.length
    };
  }

  /**
   * Get game count for a sport without fetching full documents
   * Uses countDocuments for efficiency
   * 
   * @param {string} sportName - The sport name to count (exact match)
   * @returns {Promise<number>} Total count of games for the sport
   * 
   * Requirements: 3.2
   */
  static async getGameCount(sportName) {
    // Use countDocuments with exact match - more efficient than fetching documents
    return Game.countDocuments({ sport: sportName });
  }

  /**
   * Get count of latest games for a sport (games with the most recent timestamp)
   * 
   * @param {string} sportName - The sport name to count (exact match)
   * @returns {Promise<number>} Count of games with the latest timestamp
   * 
   * Requirements: 3.1, 3.2
   */
  static async getLatestGameCount(sportName) {
    // First find the latest timestamp
    const latestGame = await Game.findOne({ sport: sportName })
      .sort({ last_updated: -1 })
      .select('last_updated')
      .lean();

    if (!latestGame) {
      return 0;
    }

    // Count documents with that timestamp
    return Game.countDocuments({
      sport: sportName,
      last_updated: latestGame.last_updated
    });
  }

  /**
   * Bulk upsert games with parallel processing
   * Uses bulkWrite with ordered:false for better performance
   * 
   * @param {Array} games - Array of game objects to upsert
   * @param {string} sportName - The sport name for these games
   * @returns {Promise<{upsertedCount: number, modifiedCount: number, matchedCount: number}>} Operation results
   * 
   * Requirements: 3.3
   */
  static async bulkUpsertGames(games, sportName) {
    if (!games || games.length === 0) {
      return {
        upsertedCount: 0,
        modifiedCount: 0,
        matchedCount: 0
      };
    }

    const scrapeTimestamp = new Date();
    
    const operations = games.map(game => ({
      updateOne: {
        filter: { gameId: game.id || game.gameId },
        update: {
          $set: {
            ...game,
            gameId: game.id || game.gameId,
            sport: sportName,
            last_updated: scrapeTimestamp
          }
        },
        upsert: true
      }
    }));

    // Use ordered: false for parallel processing
    // This allows MongoDB to process operations in parallel rather than sequentially
    // If one operation fails, others will still be attempted
    const result = await Game.bulkWrite(operations, { ordered: false });

    return {
      upsertedCount: result.upsertedCount || 0,
      modifiedCount: result.modifiedCount || 0,
      matchedCount: result.matchedCount || 0,
      scrapeTimestamp
    };
  }

  /**
   * Find sport by name with exact matching (case-sensitive)
   * Falls back to case-insensitive search if exact match not found
   * 
   * @param {string} sportName - The sport name to find
   * @returns {Promise<string|null>} The exact sport name from DB or null
   * 
   * Requirements: 3.2
   */
  static async findExactSportName(sportName) {
    // Try exact match first (most efficient)
    const exactMatch = await Game.findOne({ sport: sportName })
      .select('sport')
      .lean();

    if (exactMatch) {
      return exactMatch.sport;
    }

    // Fall back to case-insensitive search if needed
    // This is less efficient but provides better UX
    const caseInsensitiveMatch = await Game.findOne({
      sport: { $regex: new RegExp(`^${sportName}$`, 'i') }
    })
      .select('sport')
      .lean();

    return caseInsensitiveMatch?.sport || null;
  }

  static async getLatestCountsBySport(extraMatch = {}) {
    const pipeline = [
      ...(extraMatch && Object.keys(extraMatch).length ? [{ $match: extraMatch }] : []),
      {
        $group: {
          _id: { sport: '$sport', ts: '$last_updated' },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.sport': 1, '_id.ts': -1 } },
      {
        $group: {
          _id: '$_id.sport',
          last_updated: { $first: '$_id.ts' },
          count: { $first: '$count' }
        }
      },
      { $project: { _id: 0, name: '$_id', count: 1, last_updated: 1 } },
      { $sort: { name: 1 } }
    ];

    const rows = await Game.aggregate(pipeline);
    const sports = Array.isArray(rows) ? rows.map(r => ({ name: r.name, count: r.count })) : [];
    const totalGames = sports.reduce((sum, s) => sum + (Number(s?.count) || 0), 0);

    return { sports, totalGames };
  }

  static async getSportsWithAnyGames() {
    return Game.distinct('sport');
  }
}

module.exports = QueryOptimizer;
