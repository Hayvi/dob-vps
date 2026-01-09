/**
 * Integration tests for hierarchy caching
 * Feature: performance-optimization
 * 
 * **Validates: Requirements 1.1, 1.2**
 */
const CacheManager = require('../utils/CacheManager');

describe('Hierarchy Caching Integration Tests', () => {
  let hierarchyCache;
  const HIERARCHY_CACHE_KEY = 'hierarchy';

  beforeEach(() => {
    // Create a fresh cache instance for each test
    hierarchyCache = new CacheManager(300000); // 5 minute TTL
  });

  describe('Cache Hit Returns Cached Data', () => {
    it('should return cached hierarchy data on cache hit', () => {
      // Simulate storing hierarchy data (as the endpoint would do on first call)
      const mockHierarchy = {
        sport: {
          '1': { id: 1, name: 'Football', alias: 'football' },
          '2': { id: 2, name: 'Basketball', alias: 'basketball' }
        }
      };
      
      hierarchyCache.set(HIERARCHY_CACHE_KEY, mockHierarchy);
      
      // Simulate cache hit (as the endpoint would check)
      const cachedData = hierarchyCache.get(HIERARCHY_CACHE_KEY);
      
      expect(cachedData).not.toBeNull();
      expect(cachedData).toEqual(mockHierarchy);
      expect(cachedData.sport['1'].name).toBe('Football');
    });

    it('should increment hit count when returning cached data', () => {
      const mockHierarchy = { sport: { '1': { name: 'Football' } } };
      
      hierarchyCache.set(HIERARCHY_CACHE_KEY, mockHierarchy);
      
      // Multiple cache hits
      hierarchyCache.get(HIERARCHY_CACHE_KEY);
      hierarchyCache.get(HIERARCHY_CACHE_KEY);
      hierarchyCache.get(HIERARCHY_CACHE_KEY);
      
      const stats = hierarchyCache.getStats();
      expect(stats.hits).toBe(3);
      expect(stats.misses).toBe(0);
    });

    it('should return same data structure on subsequent cache hits', () => {
      const mockHierarchy = {
        sport: {
          '1': { id: 1, name: 'Football' },
          '3': { id: 3, name: 'Tennis' }
        },
        region: { '100': { name: 'Europe' } }
      };
      
      hierarchyCache.set(HIERARCHY_CACHE_KEY, mockHierarchy);
      
      const firstHit = hierarchyCache.get(HIERARCHY_CACHE_KEY);
      const secondHit = hierarchyCache.get(HIERARCHY_CACHE_KEY);
      
      expect(firstHit).toEqual(secondHit);
      expect(firstHit).toEqual(mockHierarchy);
    });
  });

  describe('Cache Miss Fetches Fresh Data', () => {
    it('should return null on cache miss (empty cache)', () => {
      // Cache is empty - simulates first request or after restart
      const cachedData = hierarchyCache.get(HIERARCHY_CACHE_KEY);
      
      expect(cachedData).toBeNull();
    });

    it('should increment miss count on cache miss', () => {
      // Attempt to get non-existent data
      hierarchyCache.get(HIERARCHY_CACHE_KEY);
      hierarchyCache.get('other_key');
      
      const stats = hierarchyCache.getStats();
      expect(stats.misses).toBe(2);
      expect(stats.hits).toBe(0);
    });

    it('should return null after cache expiration (simulating stale data)', async () => {
      // Use short TTL for testing expiration
      const shortTTLCache = new CacheManager(50); // 50ms TTL
      
      const mockHierarchy = { sport: { '1': { name: 'Football' } } };
      shortTTLCache.set(HIERARCHY_CACHE_KEY, mockHierarchy);
      
      // Verify data is cached
      expect(shortTTLCache.get(HIERARCHY_CACHE_KEY)).toEqual(mockHierarchy);
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 60));
      
      // Should return null after expiration (cache miss)
      const expiredData = shortTTLCache.get(HIERARCHY_CACHE_KEY);
      expect(expiredData).toBeNull();
    });

    it('should allow storing fresh data after cache miss', () => {
      // Initial cache miss
      expect(hierarchyCache.get(HIERARCHY_CACHE_KEY)).toBeNull();
      
      // Simulate fetching and storing fresh data
      const freshHierarchy = {
        sport: { '1': { id: 1, name: 'Football', alias: 'football' } }
      };
      hierarchyCache.set(HIERARCHY_CACHE_KEY, freshHierarchy);
      
      // Subsequent request should hit cache
      const cachedData = hierarchyCache.get(HIERARCHY_CACHE_KEY);
      expect(cachedData).toEqual(freshHierarchy);
    });
  });

  describe('Cache Update Flow', () => {
    it('should update cache with fresh data when old data expires', async () => {
      const shortTTLCache = new CacheManager(50);
      
      const oldHierarchy = { sport: { '1': { name: 'Old Football' } } };
      shortTTLCache.set(HIERARCHY_CACHE_KEY, oldHierarchy);
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 60));
      
      // Cache miss - would trigger fresh fetch
      expect(shortTTLCache.get(HIERARCHY_CACHE_KEY)).toBeNull();
      
      // Store new data (simulating fresh fetch)
      const newHierarchy = { sport: { '1': { name: 'New Football' } } };
      shortTTLCache.set(HIERARCHY_CACHE_KEY, newHierarchy);
      
      // Verify new data is cached
      expect(shortTTLCache.get(HIERARCHY_CACHE_KEY)).toEqual(newHierarchy);
    });
  });
});
