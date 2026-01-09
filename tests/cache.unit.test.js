/**
 * Unit tests for CacheManager edge cases
 * Feature: performance-optimization
 * 
 * **Validates: Requirements 1.5**
 */
const CacheManager = require('../utils/CacheManager');

describe('CacheManager Unit Tests', () => {
  describe('TTL Expiration Behavior', () => {
    it('should return null for expired entries', async () => {
      const cache = new CacheManager(50); // 50ms TTL
      
      cache.set('expiring', 'value');
      expect(cache.get('expiring')).toBe('value');
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 60));
      
      expect(cache.get('expiring')).toBeNull();
    });

    it('should respect custom TTL over default', async () => {
      const cache = new CacheManager(1000); // 1 second default
      
      cache.set('shortTTL', 'value', 50); // 50ms custom TTL
      expect(cache.get('shortTTL')).toBe('value');
      
      await new Promise(resolve => setTimeout(resolve, 60));
      
      expect(cache.get('shortTTL')).toBeNull();
    });

    it('should clean up expired entries on has() check', async () => {
      const cache = new CacheManager(50);
      
      cache.set('key', 'value');
      expect(cache.has('key')).toBe(true);
      
      await new Promise(resolve => setTimeout(resolve, 60));
      
      expect(cache.has('key')).toBe(false);
    });
  });

  describe('Cache Statistics Accuracy', () => {
    it('should track hits correctly', () => {
      const cache = new CacheManager();
      
      cache.set('key', 'value');
      cache.get('key');
      cache.get('key');
      cache.get('key');
      
      expect(cache.getStats().hits).toBe(3);
    });

    it('should track misses correctly', () => {
      const cache = new CacheManager();
      
      cache.get('nonexistent1');
      cache.get('nonexistent2');
      
      expect(cache.getStats().misses).toBe(2);
    });

    it('should count expired entries as misses', async () => {
      const cache = new CacheManager(50);
      
      cache.set('key', 'value');
      cache.get('key'); // hit
      
      await new Promise(resolve => setTimeout(resolve, 60));
      
      cache.get('key'); // miss (expired)
      
      const stats = cache.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
    });

    it('should track size correctly', () => {
      const cache = new CacheManager();
      
      expect(cache.getStats().size).toBe(0);
      
      cache.set('key1', 'value1');
      expect(cache.getStats().size).toBe(1);
      
      cache.set('key2', 'value2');
      expect(cache.getStats().size).toBe(2);
      
      cache.delete('key1');
      expect(cache.getStats().size).toBe(1);
    });
  });

  describe('Empty Cache State on Initialization', () => {
    it('should start with empty cache', () => {
      const cache = new CacheManager();
      
      expect(cache.getStats().size).toBe(0);
      expect(cache.getStats().hits).toBe(0);
      expect(cache.getStats().misses).toBe(0);
    });

    it('should use default TTL of 5 minutes', () => {
      const cache = new CacheManager();
      
      expect(cache.defaultTTL).toBe(300000);
    });

    it('should accept custom default TTL', () => {
      const cache = new CacheManager(60000);
      
      expect(cache.defaultTTL).toBe(60000);
    });
  });
});
