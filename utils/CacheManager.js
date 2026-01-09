/**
 * CacheManager - In-memory cache with TTL (Time-To-Live) support
 * 
 * Provides caching functionality to reduce database and external API calls.
 * Supports configurable TTL, manual invalidation, and cache statistics.
 */
class CacheManager {
  /**
   * Create a new CacheManager instance
   * @param {number} defaultTTL - Default time-to-live in milliseconds (default: 5 minutes)
   */
  constructor(defaultTTL = 300000) {
    this.defaultTTL = defaultTTL;
    this.cache = new Map();
    this.stats = {
      hits: 0,
      misses: 0
    };
  }

  /**
   * Store a value in the cache with optional custom TTL
   * @param {string} key - Cache key
   * @param {*} value - Value to store
   * @param {number} [ttl] - Optional custom TTL in milliseconds
   */
  set(key, value, ttl) {
    const now = Date.now();
    const expiresAt = now + (ttl !== undefined ? ttl : this.defaultTTL);
    
    this.cache.set(key, {
      value,
      createdAt: now,
      expiresAt
    });
  }

  /**
   * Retrieve a value from the cache
   * @param {string} key - Cache key
   * @returns {*} The cached value, or null if expired or missing
   */
  get(key) {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.stats.misses++;
      return null;
    }
    
    // Check if entry has expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.stats.misses++;
      return null;
    }
    
    this.stats.hits++;
    return entry.value;
  }

  /**
   * Check if a key exists and is not expired
   * @param {string} key - Cache key
   * @returns {boolean} True if key exists and is not expired
   */
  has(key) {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return false;
    }
    
    // Check if entry has expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return false;
    }
    
    return true;
  }

  /**
   * Remove a specific key from the cache
   * @param {string} key - Cache key to remove
   * @returns {boolean} True if the key was found and removed
   */
  delete(key) {
    return this.cache.delete(key);
  }

  /**
   * Clear all cached data
   */
  clear() {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   * @returns {{hits: number, misses: number, size: number}} Cache statistics
   */
  getStats() {
    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      size: this.cache.size
    };
  }
}

module.exports = CacheManager;
