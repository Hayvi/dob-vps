/**
 * PaginationHelper - Utility for handling pagination parameters and metadata
 * 
 * Provides static methods for parsing pagination params from requests,
 * building pagination metadata for responses, and applying pagination to MongoDB queries.
 */
class PaginationHelper {
  static DEFAULT_LIMIT = 100;
  static MAX_LIMIT = 500;

  /**
   * Parse and validate pagination parameters from request query
   * @param {Object} query - Request query object containing limit and skip
   * @returns {{limit: number, skip: number}} Validated pagination parameters
   */
  static parseParams(query = {}) {
    let limit = parseInt(query.limit, 10);
    let skip = parseInt(query.skip, 10);

    // Handle non-numeric or invalid values
    if (isNaN(limit) || limit < 0) {
      limit = PaginationHelper.DEFAULT_LIMIT;
    }

    if (isNaN(skip) || skip < 0) {
      skip = 0;
    }

    // Enforce maximum limit
    if (limit > PaginationHelper.MAX_LIMIT) {
      limit = PaginationHelper.MAX_LIMIT;
    }

    return { limit, skip };
  }

  /**
   * Build pagination metadata for response
   * @param {number} total - Total number of records in the dataset
   * @param {number} limit - Number of records per page
   * @param {number} skip - Number of records to skip
   * @returns {{total: number, limit: number, skip: number, hasMore: boolean, page: number}} Pagination metadata
   */
  static buildMetadata(total, limit, skip) {
    // Ensure total is non-negative
    const safeTotal = Math.max(0, total);
    
    // Calculate current page (1-indexed)
    const page = Math.floor(skip / limit) + 1;
    
    // Determine if there are more records
    const hasMore = (skip + limit) < safeTotal;

    return {
      total: safeTotal,
      limit,
      skip,
      hasMore,
      page
    };
  }

  /**
   * Apply pagination to a MongoDB query
   * @param {Object} query - MongoDB query object with skip() and limit() methods
   * @param {{limit: number, skip: number}} params - Pagination parameters
   * @returns {Object} The query with pagination applied
   */
  static applyToQuery(query, params) {
    return query.skip(params.skip).limit(params.limit);
  }
}

module.exports = PaginationHelper;
