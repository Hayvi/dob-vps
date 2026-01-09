/**
 * Property-based tests for RateLimitedScraper
 * Feature: performance-optimization
 * 
 * Uses fast-check library for property-based testing
 */
const fc = require('fast-check');
const RateLimitedScraper = require('../utils/RateLimitedScraper');

describe('RateLimitedScraper Property Tests', () => {
  /**
   * Feature: performance-optimization, Property 5: Concurrency Limit Enforcement
   * 
   * For any bulk scraping operation with N sports, at no point in time 
   * SHALL more than 3 scraping operations be executing concurrently.
   * 
   * **Validates: Requirements 5.1**
   */
  describe('Property 5: Concurrency Limit Enforcement', () => {
    it('should never exceed the configured concurrency limit during bulk scraping', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate array of sports (1-20 sports)
          fc.array(
            fc.record({
              id: fc.integer({ min: 1, max: 1000 }),
              name: fc.string({ minLength: 1, maxLength: 20 })
            }),
            { minLength: 1, maxLength: 20 }
          ),
          // Generate concurrency limit (1-5)
          fc.integer({ min: 1, max: 5 }),
          async (sports, concurrencyLimit) => {
            let maxConcurrent = 0;
            let currentConcurrent = 0;
            
            // Create a mock scraper that tracks concurrent executions
            const mockScraper = {
              getGamesBySport: async (sportId) => {
                currentConcurrent++;
                maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
                
                // Simulate async work with small random delay
                await new Promise(resolve => setTimeout(resolve, Math.random() * 10));
                
                currentConcurrent--;
                return [{ id: sportId, game: 'test' }];
              }
            };
            
            const rateLimitedScraper = new RateLimitedScraper(mockScraper, {
              concurrency: concurrencyLimit,
              maxRetries: 0,
              retryDelayMs: 1
            });
            
            await rateLimitedScraper.scrapeAll(sports);
            
            // The maximum concurrent operations should never exceed the limit
            expect(maxConcurrent).toBeLessThanOrEqual(concurrencyLimit);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should respect default concurrency limit of 3', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate array of sports (5-15 sports to ensure concurrency is tested)
          fc.array(
            fc.record({
              id: fc.integer({ min: 1, max: 1000 }),
              name: fc.string({ minLength: 1, maxLength: 20 })
            }),
            { minLength: 5, maxLength: 15 }
          ),
          async (sports) => {
            let maxConcurrent = 0;
            let currentConcurrent = 0;
            const DEFAULT_CONCURRENCY = 3;
            
            const mockScraper = {
              getGamesBySport: async (sportId) => {
                currentConcurrent++;
                maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
                
                // Simulate async work
                await new Promise(resolve => setTimeout(resolve, Math.random() * 10));
                
                currentConcurrent--;
                return [{ id: sportId }];
              }
            };
            
            // Use default options (concurrency should be 3)
            const rateLimitedScraper = new RateLimitedScraper(mockScraper);
            
            await rateLimitedScraper.scrapeAll(sports);
            
            expect(maxConcurrent).toBeLessThanOrEqual(DEFAULT_CONCURRENCY);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Feature: performance-optimization, Property 6: Progress Tracking Accuracy
   * 
   * For any bulk scraping operation with N sports, the progress callback 
   * SHALL be called exactly N times with incrementing completed counts from 1 to N.
   * 
   * **Validates: Requirements 5.3**
   */
  describe('Property 6: Progress Tracking Accuracy', () => {
    it('should call progress callback exactly N times with incrementing completed counts', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate array of sports (1-20 sports)
          fc.array(
            fc.record({
              id: fc.integer({ min: 1, max: 1000 }),
              name: fc.string({ minLength: 1, maxLength: 20 })
            }),
            { minLength: 1, maxLength: 20 }
          ),
          async (sports) => {
            const progressCalls = [];
            
            const mockScraper = {
              getGamesBySport: async (sportId) => {
                // Simulate async work with small delay
                await new Promise(resolve => setTimeout(resolve, Math.random() * 5));
                return [{ id: sportId, game: 'test' }];
              }
            };
            
            const rateLimitedScraper = new RateLimitedScraper(mockScraper, {
              concurrency: 3,
              maxRetries: 0,
              retryDelayMs: 1
            });
            
            // Track all progress callback invocations
            const onProgress = (progress) => {
              progressCalls.push({
                completed: progress.completed,
                total: progress.total,
                current: progress.current,
                success: progress.success
              });
            };
            
            await rateLimitedScraper.scrapeAll(sports, onProgress);
            
            const N = sports.length;
            
            // Progress callback should be called exactly N times
            expect(progressCalls.length).toBe(N);
            
            // All calls should have correct total
            for (const call of progressCalls) {
              expect(call.total).toBe(N);
            }
            
            // Completed counts should range from 1 to N (each value appearing exactly once)
            const completedCounts = progressCalls.map(c => c.completed).sort((a, b) => a - b);
            const expectedCounts = Array.from({ length: N }, (_, i) => i + 1);
            expect(completedCounts).toEqual(expectedCounts);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should include current sport name and success status in progress updates', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate array of sports (1-10 sports)
          fc.array(
            fc.record({
              id: fc.integer({ min: 1, max: 1000 }),
              name: fc.string({ minLength: 1, maxLength: 20 })
            }),
            { minLength: 1, maxLength: 10 }
          ),
          async (sports) => {
            const progressCalls = [];
            
            const mockScraper = {
              getGamesBySport: async (sportId) => {
                await new Promise(resolve => setTimeout(resolve, Math.random() * 5));
                return [{ id: sportId }];
              }
            };
            
            const rateLimitedScraper = new RateLimitedScraper(mockScraper, {
              concurrency: 3,
              maxRetries: 0,
              retryDelayMs: 1
            });
            
            const onProgress = (progress) => {
              progressCalls.push(progress);
            };
            
            await rateLimitedScraper.scrapeAll(sports, onProgress);
            
            // Each progress call should have a current sport name from the input
            const sportNames = sports.map(s => s.name);
            for (const call of progressCalls) {
              expect(sportNames).toContain(call.current);
              expect(typeof call.success).toBe('boolean');
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
