/**
 * Property-based tests for CacheManager
 * Feature: performance-optimization
 * 
 * Uses fast-check library for property-based testing
 */
const fc = require('fast-check');
const CacheManager = require('../utils/CacheManager');

describe('CacheManager Property Tests', () => {
  /**
   * Feature: performance-optimization, Property 1: Cache Round-Trip Consistency
   * 
   * For any valid key-value pair stored in the cache, retrieving the value 
   * before TTL expiration SHALL return the exact same value that was stored.
   * 
   * **Validates: Requirements 1.1, 1.3**
   */
  describe('Property 1: Cache Round-Trip Consistency', () => {
    it('should return the exact same value that was stored for any key-value pair', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }),  // key
          fc.anything(),                 // value (any type)
          (key, value) => {
            const cache = new CacheManager(300000); // 5 minute TTL
            
            cache.set(key, value);
            const retrieved = cache.get(key);
            
            // Deep equality check for objects, strict equality for primitives
            if (typeof value === 'object' && value !== null) {
              expect(retrieved).toEqual(value);
            } else {
              expect(retrieved).toBe(value);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should preserve value types through cache round-trip', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }),
          fc.oneof(
            fc.string(),
            fc.integer(),
            fc.double(),
            fc.boolean(),
            fc.array(fc.integer()),
            fc.dictionary(fc.string(), fc.integer())
          ),
          (key, value) => {
            const cache = new CacheManager();
            
            cache.set(key, value);
            const retrieved = cache.get(key);
            
            expect(typeof retrieved).toBe(typeof value);
            expect(retrieved).toEqual(value);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Feature: performance-optimization, Property 2: Cache Invalidation Completeness
   * 
   * For any key that exists in the cache, calling delete on that key 
   * SHALL result in subsequent get calls returning null.
   * 
   * **Validates: Requirements 1.4**
   */
  describe('Property 2: Cache Invalidation Completeness', () => {
    it('should return null after deleting any cached key', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }),
          fc.anything(),
          (key, value) => {
            const cache = new CacheManager();
            
            // Store value
            cache.set(key, value);
            expect(cache.has(key)).toBe(true);
            
            // Delete and verify
            cache.delete(key);
            expect(cache.get(key)).toBeNull();
            expect(cache.has(key)).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should remove all keys when clear is called', () => {
      fc.assert(
        fc.property(
          fc.array(fc.tuple(fc.string({ minLength: 1 }), fc.anything()), { minLength: 1, maxLength: 20 }),
          (keyValuePairs) => {
            const cache = new CacheManager();
            
            // Store all key-value pairs
            for (const [key, value] of keyValuePairs) {
              cache.set(key, value);
            }
            
            // Clear cache
            cache.clear();
            
            // Verify all keys are gone
            for (const [key] of keyValuePairs) {
              expect(cache.get(key)).toBeNull();
              expect(cache.has(key)).toBe(false);
            }
            
            expect(cache.getStats().size).toBe(0);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
