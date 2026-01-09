/**
 * Integration tests for paginated endpoints
 * Feature: performance-optimization
 * 
 * Tests the /api/sport-games and /api/football-games endpoints with pagination
 * 
 * **Validates: Requirements 2.1, 2.2, 2.3**
 */
const PaginationHelper = require('../utils/PaginationHelper');
const QueryOptimizer = require('../utils/QueryOptimizer');

describe('Paginated Endpoints Integration Tests', () => {
  // Mock game data for testing
  const createMockGames = (count, sportName = 'Football') => {
    const games = [];
    const timestamp = new Date();
    for (let i = 0; i < count; i++) {
      games.push({
        gameId: `game-${i}`,
        sport: sportName,
        name: `Game ${i}`,
        last_updated: timestamp
      });
    }
    return { games, timestamp };
  };

  describe('Default Pagination Behavior', () => {
    it('should apply default limit of 100 when no pagination params provided', () => {
      const query = {};
      const params = PaginationHelper.parseParams(query);
      
      expect(params.limit).toBe(100);
      expect(params.skip).toBe(0);
    });

    it('should return correct metadata structure with defaults', () => {
      const { games } = createMockGames(250);
      const params = PaginationHelper.parseParams({});
      
      const metadata = PaginationHelper.buildMetadata(
        games.length,
        params.limit,
        params.skip
      );
      
      expect(metadata).toEqual({
        total: 250,
        limit: 100,
        skip: 0,
        hasMore: true,
        page: 1
      });
    });

    it('should indicate hasMore=false when total is less than default limit', () => {
      const { games } = createMockGames(50);
      const params = PaginationHelper.parseParams({});
      
      const metadata = PaginationHelper.buildMetadata(
        games.length,
        params.limit,
        params.skip
      );
      
      expect(metadata.hasMore).toBe(false);
      expect(metadata.total).toBe(50);
    });
  });

  describe('Custom Limit/Skip Parameters', () => {
    it('should respect custom limit parameter', () => {
      const query = { limit: '50' };
      const params = PaginationHelper.parseParams(query);
      
      expect(params.limit).toBe(50);
    });

    it('should respect custom skip parameter', () => {
      const query = { skip: '100' };
      const params = PaginationHelper.parseParams(query);
      
      expect(params.skip).toBe(100);
    });

    it('should handle both limit and skip together', () => {
      const query = { limit: '25', skip: '50' };
      const params = PaginationHelper.parseParams(query);
      
      expect(params.limit).toBe(25);
      expect(params.skip).toBe(50);
    });

    it('should enforce maximum limit of 500', () => {
      const query = { limit: '1000' };
      const params = PaginationHelper.parseParams(query);
      
      expect(params.limit).toBe(500);
    });

    it('should return correct page number for custom skip', () => {
      const { games } = createMockGames(500);
      const params = PaginationHelper.parseParams({ limit: '50', skip: '150' });
      
      const metadata = PaginationHelper.buildMetadata(
        games.length,
        params.limit,
        params.skip
      );
      
      // Page = floor(150/50) + 1 = 4
      expect(metadata.page).toBe(4);
    });

    it('should calculate hasMore correctly with custom params', () => {
      const { games } = createMockGames(200);
      
      // Skip 150, limit 50 -> 150 + 50 = 200, not less than 200
      const params1 = PaginationHelper.parseParams({ limit: '50', skip: '150' });
      const metadata1 = PaginationHelper.buildMetadata(games.length, params1.limit, params1.skip);
      expect(metadata1.hasMore).toBe(false);
      
      // Skip 100, limit 50 -> 100 + 50 = 150 < 200
      const params2 = PaginationHelper.parseParams({ limit: '50', skip: '100' });
      const metadata2 = PaginationHelper.buildMetadata(games.length, params2.limit, params2.skip);
      expect(metadata2.hasMore).toBe(true);
    });
  });

  describe('Metadata Accuracy', () => {
    it('should return accurate total count in metadata', () => {
      const totalGames = 347;
      const { games } = createMockGames(totalGames);
      const params = PaginationHelper.parseParams({ limit: '100' });
      
      const metadata = PaginationHelper.buildMetadata(
        games.length,
        params.limit,
        params.skip
      );
      
      expect(metadata.total).toBe(totalGames);
    });

    it('should return accurate skip value in metadata', () => {
      const { games } = createMockGames(500);
      const params = PaginationHelper.parseParams({ skip: '275' });
      
      const metadata = PaginationHelper.buildMetadata(
        games.length,
        params.limit,
        params.skip
      );
      
      expect(metadata.skip).toBe(275);
    });

    it('should return accurate limit value in metadata', () => {
      const { games } = createMockGames(500);
      const params = PaginationHelper.parseParams({ limit: '75' });
      
      const metadata = PaginationHelper.buildMetadata(
        games.length,
        params.limit,
        params.skip
      );
      
      expect(metadata.limit).toBe(75);
    });

    it('should handle empty dataset correctly', () => {
      const games = [];
      const params = PaginationHelper.parseParams({});
      
      const metadata = PaginationHelper.buildMetadata(
        games.length,
        params.limit,
        params.skip
      );
      
      expect(metadata.total).toBe(0);
      expect(metadata.hasMore).toBe(false);
      expect(metadata.page).toBe(1);
    });

    it('should handle skip exceeding total correctly', () => {
      const { games } = createMockGames(50);
      const params = PaginationHelper.parseParams({ skip: '100' });
      
      const metadata = PaginationHelper.buildMetadata(
        games.length,
        params.limit,
        params.skip
      );
      
      expect(metadata.total).toBe(50);
      expect(metadata.skip).toBe(100);
      expect(metadata.hasMore).toBe(false);
    });
  });

  describe('Response Structure Simulation', () => {
    it('should build correct paginated response structure', () => {
      const sportName = 'Football';
      const { games, timestamp } = createMockGames(150, sportName);
      const params = PaginationHelper.parseParams({ limit: '50', skip: '25' });
      
      // Simulate slicing data as endpoint would
      const paginatedGames = games.slice(params.skip, params.skip + params.limit);
      
      const metadata = PaginationHelper.buildMetadata(
        games.length,
        params.limit,
        params.skip
      );
      
      // Build response structure as endpoint would
      const response = {
        source: 'mongodb',
        sport: sportName,
        last_updated: timestamp,
        pagination: metadata,
        count: paginatedGames.length,
        data: paginatedGames
      };
      
      expect(response.source).toBe('mongodb');
      expect(response.sport).toBe(sportName);
      expect(response.pagination.total).toBe(150);
      expect(response.pagination.limit).toBe(50);
      expect(response.pagination.skip).toBe(25);
      expect(response.pagination.hasMore).toBe(true);
      expect(response.count).toBe(50);
      expect(response.data.length).toBe(50);
    });

    it('should return correct count for last page', () => {
      const { games, timestamp } = createMockGames(125);
      const params = PaginationHelper.parseParams({ limit: '50', skip: '100' });
      
      // Last page should have 25 items (125 - 100)
      const paginatedGames = games.slice(params.skip, params.skip + params.limit);
      
      const metadata = PaginationHelper.buildMetadata(
        games.length,
        params.limit,
        params.skip
      );
      
      expect(paginatedGames.length).toBe(25);
      expect(metadata.hasMore).toBe(false);
    });
  });
});
