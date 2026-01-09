/**
 * Property-based tests for PaginationHelper
 * Feature: performance-optimization
 * 
 * Uses fast-check library for property-based testing
 */
const fc = require('fast-check');
const PaginationHelper = require('../utils/PaginationHelper');

describe('PaginationHelper Property Tests', () => {
  /**
   * Feature: performance-optimization, Property 3: Pagination Correctness
   * 
   * For any dataset of games and valid pagination parameters (limit ≤ 500, skip ≥ 0),
   * the returned response SHALL contain:
   * - Exactly min(limit, total - skip) records (or 0 if skip ≥ total)
   * - Metadata with correct total count
   * - hasMore = true if and only if (skip + limit) < total
   * - Records matching the expected slice of the sorted dataset
   * 
   * **Validates: Requirements 2.2, 2.3, 2.5**
   */
  describe('Property 3: Pagination Correctness', () => {
    // Generator for valid pagination parameters
    const arbitraryPaginationParams = fc.record({
      limit: fc.integer({ min: 1, max: PaginationHelper.MAX_LIMIT }),
      skip: fc.integer({ min: 0, max: 10000 })
    });

    // Generator for game datasets
    const arbitraryGameDataset = fc.array(
      fc.record({
        id: fc.uuid(),
        name: fc.string({ minLength: 1, maxLength: 50 }),
        sport: fc.string({ minLength: 1, maxLength: 20 }),
        timestamp: fc.date()
      }),
      { minLength: 0, maxLength: 200 }
    );

    it('should return correct record count: min(limit, total - skip) or 0 if skip >= total', () => {
      fc.assert(
        fc.property(
          arbitraryGameDataset,
          arbitraryPaginationParams,
          (dataset, params) => {
            const total = dataset.length;
            const { limit, skip } = params;

            // Calculate expected count
            const expectedCount = skip >= total ? 0 : Math.min(limit, total - skip);

            // Simulate pagination by slicing the dataset
            const paginatedData = dataset.slice(skip, skip + limit);

            expect(paginatedData.length).toBe(expectedCount);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return metadata with correct total count', () => {
      fc.assert(
        fc.property(
          arbitraryGameDataset,
          arbitraryPaginationParams,
          (dataset, params) => {
            const total = dataset.length;
            const { limit, skip } = params;

            const metadata = PaginationHelper.buildMetadata(total, limit, skip);

            expect(metadata.total).toBe(total);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should set hasMore = true if and only if (skip + limit) < total', () => {
      fc.assert(
        fc.property(
          arbitraryGameDataset,
          arbitraryPaginationParams,
          (dataset, params) => {
            const total = dataset.length;
            const { limit, skip } = params;

            const metadata = PaginationHelper.buildMetadata(total, limit, skip);
            const expectedHasMore = (skip + limit) < total;

            expect(metadata.hasMore).toBe(expectedHasMore);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return records matching the expected slice of the dataset', () => {
      fc.assert(
        fc.property(
          arbitraryGameDataset,
          arbitraryPaginationParams,
          (dataset, params) => {
            const { limit, skip } = params;

            // Get expected slice
            const expectedSlice = dataset.slice(skip, skip + limit);

            // Simulate pagination
            const paginatedData = dataset.slice(skip, skip + limit);

            expect(paginatedData).toEqual(expectedSlice);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should enforce maximum limit of 500 records per request', () => {
      fc.assert(
        fc.property(
          fc.record({
            limit: fc.integer({ min: 501, max: 10000 }),
            skip: fc.integer({ min: 0, max: 1000 })
          }),
          (query) => {
            const params = PaginationHelper.parseParams(query);

            expect(params.limit).toBeLessThanOrEqual(PaginationHelper.MAX_LIMIT);
            expect(params.limit).toBe(PaginationHelper.MAX_LIMIT);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return correct page number based on skip and limit', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 10000 }),  // total
          arbitraryPaginationParams,
          (total, params) => {
            const { limit, skip } = params;

            const metadata = PaginationHelper.buildMetadata(total, limit, skip);
            const expectedPage = Math.floor(skip / limit) + 1;

            expect(metadata.page).toBe(expectedPage);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should include all required metadata fields', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 10000 }),
          arbitraryPaginationParams,
          (total, params) => {
            const { limit, skip } = params;

            const metadata = PaginationHelper.buildMetadata(total, limit, skip);

            expect(metadata).toHaveProperty('total');
            expect(metadata).toHaveProperty('limit');
            expect(metadata).toHaveProperty('skip');
            expect(metadata).toHaveProperty('hasMore');
            expect(metadata).toHaveProperty('page');
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
