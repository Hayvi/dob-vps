/**
 * Unit tests for PaginationHelper edge cases
 * Feature: performance-optimization
 * 
 * **Validates: Requirements 2.1, 2.4**
 */
const PaginationHelper = require('../utils/PaginationHelper');

describe('PaginationHelper Unit Tests', () => {
  describe('Default Limit Application', () => {
    it('should apply default limit of 100 when no limit provided', () => {
      const params = PaginationHelper.parseParams({});
      
      expect(params.limit).toBe(100);
    });

    it('should apply default limit when limit is undefined', () => {
      const params = PaginationHelper.parseParams({ limit: undefined });
      
      expect(params.limit).toBe(100);
    });

    it('should apply default limit when limit is null', () => {
      const params = PaginationHelper.parseParams({ limit: null });
      
      expect(params.limit).toBe(100);
    });

    it('should apply default limit when limit is non-numeric string', () => {
      const params = PaginationHelper.parseParams({ limit: 'abc' });
      
      expect(params.limit).toBe(100);
    });

    it('should apply default limit when limit is negative', () => {
      const params = PaginationHelper.parseParams({ limit: -10 });
      
      expect(params.limit).toBe(100);
    });

    it('should use provided limit when valid', () => {
      const params = PaginationHelper.parseParams({ limit: 50 });
      
      expect(params.limit).toBe(50);
    });

    it('should parse string limit correctly', () => {
      const params = PaginationHelper.parseParams({ limit: '75' });
      
      expect(params.limit).toBe(75);
    });
  });

  describe('Skip Exceeds Total Returns Empty Array', () => {
    it('should return hasMore=false when skip exceeds total', () => {
      const metadata = PaginationHelper.buildMetadata(50, 100, 100);
      
      expect(metadata.hasMore).toBe(false);
    });

    it('should return hasMore=false when skip equals total', () => {
      const metadata = PaginationHelper.buildMetadata(50, 100, 50);
      
      expect(metadata.hasMore).toBe(false);
    });

    it('should return correct metadata when skip far exceeds total', () => {
      const metadata = PaginationHelper.buildMetadata(10, 100, 1000);
      
      expect(metadata.total).toBe(10);
      expect(metadata.skip).toBe(1000);
      expect(metadata.hasMore).toBe(false);
    });

    it('should calculate correct page when skip exceeds total', () => {
      const metadata = PaginationHelper.buildMetadata(50, 10, 100);
      
      // Page should be 11 (skip 100 / limit 10 + 1)
      expect(metadata.page).toBe(11);
    });
  });

  describe('Empty Dataset Handling', () => {
    it('should handle empty dataset (total = 0)', () => {
      const metadata = PaginationHelper.buildMetadata(0, 100, 0);
      
      expect(metadata.total).toBe(0);
      expect(metadata.hasMore).toBe(false);
      expect(metadata.page).toBe(1);
    });

    it('should handle empty dataset with skip', () => {
      const metadata = PaginationHelper.buildMetadata(0, 100, 50);
      
      expect(metadata.total).toBe(0);
      expect(metadata.hasMore).toBe(false);
    });

    it('should handle negative total as 0', () => {
      const metadata = PaginationHelper.buildMetadata(-5, 100, 0);
      
      expect(metadata.total).toBe(0);
      expect(metadata.hasMore).toBe(false);
    });
  });

  describe('Default Skip Application', () => {
    it('should default skip to 0 when not provided', () => {
      const params = PaginationHelper.parseParams({});
      
      expect(params.skip).toBe(0);
    });

    it('should default skip to 0 when negative', () => {
      const params = PaginationHelper.parseParams({ skip: -10 });
      
      expect(params.skip).toBe(0);
    });

    it('should default skip to 0 when non-numeric', () => {
      const params = PaginationHelper.parseParams({ skip: 'invalid' });
      
      expect(params.skip).toBe(0);
    });
  });
});
