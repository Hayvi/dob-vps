/**
 * Unit tests for QueryOptimizer
 * Feature: performance-optimization
 * 
 * **Validates: Requirements 3.1, 3.3**
 */
const QueryOptimizer = require('../utils/QueryOptimizer');
const Game = require('../models/Game');

// Mock the Game model
jest.mock('../models/Game');

describe('QueryOptimizer Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Aggregation Pipeline Structure (Requirement 3.1)', () => {
    it('should use aggregation pipeline for getLatestGamesBySport', async () => {
      const mockResult = [{
        metadata: [{ total: 5 }],
        data: [
          { gameId: 1, sport: 'Football', last_updated: new Date() },
          { gameId: 2, sport: 'Football', last_updated: new Date() }
        ]
      }];
      
      Game.aggregate = jest.fn().mockResolvedValue(mockResult);
      
      await QueryOptimizer.getLatestGamesBySport('Football', { limit: 100, skip: 0 });
      
      expect(Game.aggregate).toHaveBeenCalledTimes(1);
    });

    it('should include $match stage with exact sport name', async () => {
      const mockResult = [{ metadata: [], data: [] }];
      Game.aggregate = jest.fn().mockResolvedValue(mockResult);
      
      await QueryOptimizer.getLatestGamesBySport('Basketball', { limit: 100, skip: 0 });
      
      const pipeline = Game.aggregate.mock.calls[0][0];
      const matchStage = pipeline.find(stage => stage.$match && stage.$match.sport);
      
      expect(matchStage).toBeDefined();
      expect(matchStage.$match.sport).toBe('Basketball');
    });

    it('should include $sort stage for last_updated descending', async () => {
      const mockResult = [{ metadata: [], data: [] }];
      Game.aggregate = jest.fn().mockResolvedValue(mockResult);
      
      await QueryOptimizer.getLatestGamesBySport('Tennis', { limit: 100, skip: 0 });
      
      const pipeline = Game.aggregate.mock.calls[0][0];
      const sortStage = pipeline.find(stage => stage.$sort);
      
      expect(sortStage).toBeDefined();
      expect(sortStage.$sort.last_updated).toBe(-1);
    });

    it('should include $facet stage for pagination and count', async () => {
      const mockResult = [{ metadata: [], data: [] }];
      Game.aggregate = jest.fn().mockResolvedValue(mockResult);
      
      await QueryOptimizer.getLatestGamesBySport('Hockey', { limit: 50, skip: 10 });
      
      const pipeline = Game.aggregate.mock.calls[0][0];
      const facetStage = pipeline.find(stage => stage.$facet);
      
      expect(facetStage).toBeDefined();
      expect(facetStage.$facet.metadata).toBeDefined();
      expect(facetStage.$facet.data).toBeDefined();
    });

    it('should apply correct skip and limit in facet data stage', async () => {
      const mockResult = [{ metadata: [], data: [] }];
      Game.aggregate = jest.fn().mockResolvedValue(mockResult);
      
      await QueryOptimizer.getLatestGamesBySport('Soccer', { limit: 25, skip: 50 });
      
      const pipeline = Game.aggregate.mock.calls[0][0];
      const facetStage = pipeline.find(stage => stage.$facet);
      
      const skipStage = facetStage.$facet.data.find(s => s.$skip !== undefined);
      const limitStage = facetStage.$facet.data.find(s => s.$limit !== undefined);
      
      expect(skipStage.$skip).toBe(50);
      expect(limitStage.$limit).toBe(25);
    });

    it('should return correct structure from aggregation result', async () => {
      const testDate = new Date('2025-12-26');
      const mockResult = [{
        metadata: [{ total: 10 }],
        data: [
          { gameId: 1, sport: 'Football', last_updated: testDate },
          { gameId: 2, sport: 'Football', last_updated: testDate }
        ]
      }];
      
      Game.aggregate = jest.fn().mockResolvedValue(mockResult);
      
      const result = await QueryOptimizer.getLatestGamesBySport('Football', { limit: 100, skip: 0 });
      
      expect(result).toHaveProperty('games');
      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('lastUpdated');
      expect(result.total).toBe(10);
      expect(result.games).toHaveLength(2);
      expect(result.lastUpdated).toEqual(testDate);
    });

    it('should handle empty result from aggregation', async () => {
      const mockResult = [{ metadata: [], data: [] }];
      Game.aggregate = jest.fn().mockResolvedValue(mockResult);
      
      const result = await QueryOptimizer.getLatestGamesBySport('UnknownSport', { limit: 100, skip: 0 });
      
      expect(result.games).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.lastUpdated).toBeNull();
    });
  });

  describe('Bulk Upsert with ordered:false (Requirement 3.3)', () => {
    it('should call bulkWrite with ordered:false option', async () => {
      const mockResult = {
        upsertedCount: 2,
        modifiedCount: 0,
        matchedCount: 0
      };
      
      Game.bulkWrite = jest.fn().mockResolvedValue(mockResult);
      
      const games = [
        { id: 1, team1_name: 'Team A', team2_name: 'Team B' },
        { id: 2, team1_name: 'Team C', team2_name: 'Team D' }
      ];
      
      await QueryOptimizer.bulkUpsertGames(games, 'Football');
      
      expect(Game.bulkWrite).toHaveBeenCalledTimes(1);
      const options = Game.bulkWrite.mock.calls[0][1];
      expect(options.ordered).toBe(false);
    });

    it('should create updateOne operations for each game', async () => {
      const mockResult = { upsertedCount: 3, modifiedCount: 0, matchedCount: 0 };
      Game.bulkWrite = jest.fn().mockResolvedValue(mockResult);
      
      const games = [
        { id: 101, team1_name: 'A', team2_name: 'B' },
        { id: 102, team1_name: 'C', team2_name: 'D' },
        { id: 103, team1_name: 'E', team2_name: 'F' }
      ];
      
      await QueryOptimizer.bulkUpsertGames(games, 'Basketball');
      
      const operations = Game.bulkWrite.mock.calls[0][0];
      expect(operations).toHaveLength(3);
      operations.forEach(op => {
        expect(op.updateOne).toBeDefined();
        expect(op.updateOne.upsert).toBe(true);
      });
    });

    it('should use gameId as filter for upsert', async () => {
      const mockResult = { upsertedCount: 1, modifiedCount: 0, matchedCount: 0 };
      Game.bulkWrite = jest.fn().mockResolvedValue(mockResult);
      
      const games = [{ id: 999, team1_name: 'X', team2_name: 'Y' }];
      
      await QueryOptimizer.bulkUpsertGames(games, 'Tennis');
      
      const operations = Game.bulkWrite.mock.calls[0][0];
      expect(operations[0].updateOne.filter).toEqual({ gameId: 999 });
    });

    it('should set sport name in update operation', async () => {
      const mockResult = { upsertedCount: 1, modifiedCount: 0, matchedCount: 0 };
      Game.bulkWrite = jest.fn().mockResolvedValue(mockResult);
      
      const games = [{ id: 1, team1_name: 'A', team2_name: 'B' }];
      
      await QueryOptimizer.bulkUpsertGames(games, 'Cricket');
      
      const operations = Game.bulkWrite.mock.calls[0][0];
      expect(operations[0].updateOne.update.$set.sport).toBe('Cricket');
    });

    it('should set last_updated timestamp in update operation', async () => {
      const mockResult = { upsertedCount: 1, modifiedCount: 0, matchedCount: 0 };
      Game.bulkWrite = jest.fn().mockResolvedValue(mockResult);
      
      const games = [{ id: 1, team1_name: 'A', team2_name: 'B' }];
      
      const beforeTime = new Date();
      await QueryOptimizer.bulkUpsertGames(games, 'Golf');
      const afterTime = new Date();
      
      const operations = Game.bulkWrite.mock.calls[0][0];
      const lastUpdated = operations[0].updateOne.update.$set.last_updated;
      
      expect(lastUpdated).toBeInstanceOf(Date);
      expect(lastUpdated.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
      expect(lastUpdated.getTime()).toBeLessThanOrEqual(afterTime.getTime());
    });

    it('should return correct counts from bulkWrite result', async () => {
      const mockResult = {
        upsertedCount: 5,
        modifiedCount: 3,
        matchedCount: 8
      };
      Game.bulkWrite = jest.fn().mockResolvedValue(mockResult);
      
      const games = Array(8).fill(null).map((_, i) => ({ id: i, team1_name: 'A', team2_name: 'B' }));
      
      const result = await QueryOptimizer.bulkUpsertGames(games, 'Football');
      
      expect(result.upsertedCount).toBe(5);
      expect(result.modifiedCount).toBe(3);
      expect(result.matchedCount).toBe(8);
    });

    it('should handle empty games array', async () => {
      const result = await QueryOptimizer.bulkUpsertGames([], 'Football');
      
      expect(Game.bulkWrite).not.toHaveBeenCalled();
      expect(result.upsertedCount).toBe(0);
      expect(result.modifiedCount).toBe(0);
      expect(result.matchedCount).toBe(0);
    });

    it('should handle null games array', async () => {
      const result = await QueryOptimizer.bulkUpsertGames(null, 'Football');
      
      expect(Game.bulkWrite).not.toHaveBeenCalled();
      expect(result.upsertedCount).toBe(0);
      expect(result.modifiedCount).toBe(0);
      expect(result.matchedCount).toBe(0);
    });

    it('should handle game with gameId property instead of id', async () => {
      const mockResult = { upsertedCount: 1, modifiedCount: 0, matchedCount: 0 };
      Game.bulkWrite = jest.fn().mockResolvedValue(mockResult);
      
      const games = [{ gameId: 555, team1_name: 'A', team2_name: 'B' }];
      
      await QueryOptimizer.bulkUpsertGames(games, 'Hockey');
      
      const operations = Game.bulkWrite.mock.calls[0][0];
      expect(operations[0].updateOne.filter).toEqual({ gameId: 555 });
      expect(operations[0].updateOne.update.$set.gameId).toBe(555);
    });
  });
});
