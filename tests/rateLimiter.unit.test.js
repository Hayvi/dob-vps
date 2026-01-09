/**
 * Unit tests for RateLimitedScraper edge cases
 * Feature: performance-optimization
 * 
 * Tests retry behavior on failure and error inclusion in summary
 * **Validates: Requirements 5.2, 5.4**
 */
const RateLimitedScraper = require('../utils/RateLimitedScraper');

describe('RateLimitedScraper Unit Tests', () => {
  /**
   * Test retry behavior on failure
   * **Validates: Requirements 5.2**
   */
  describe('Retry behavior on failure', () => {
    it('should retry up to maxRetries times on failure', async () => {
      let attemptCount = 0;
      
      const mockScraper = {
        getGamesBySport: jest.fn().mockImplementation(async () => {
          attemptCount++;
          throw new Error('Scrape failed');
        })
      };
      
      const rateLimitedScraper = new RateLimitedScraper(mockScraper, {
        concurrency: 3,
        maxRetries: 2,
        retryDelayMs: 1 // Use minimal delay for tests
      });
      
      const result = await rateLimitedScraper.scrapeSport(1, 'Football');
      
      // Should attempt 1 initial + 2 retries = 3 total attempts
      expect(attemptCount).toBe(3);
      expect(mockScraper.getGamesBySport).toHaveBeenCalledTimes(3);
      expect(result.success).toBe(false);
      expect(result.attempts).toBe(3);
    });

    it('should succeed on retry if subsequent attempt succeeds', async () => {
      let attemptCount = 0;
      
      const mockScraper = {
        getGamesBySport: jest.fn().mockImplementation(async () => {
          attemptCount++;
          if (attemptCount < 2) {
            throw new Error('Temporary failure');
          }
          return [{ id: 1, game: 'test' }];
        })
      };
      
      const rateLimitedScraper = new RateLimitedScraper(mockScraper, {
        concurrency: 3,
        maxRetries: 2,
        retryDelayMs: 1
      });
      
      const result = await rateLimitedScraper.scrapeSport(1, 'Football');
      
      expect(result.success).toBe(true);
      expect(result.attempts).toBe(2); // Failed once, succeeded on second attempt
      expect(result.data).toEqual([{ id: 1, game: 'test' }]);
    });

    it('should apply exponential backoff between retries', async () => {
      const delays = [];
      let lastCallTime = Date.now();
      
      const mockScraper = {
        getGamesBySport: jest.fn().mockImplementation(async () => {
          const now = Date.now();
          delays.push(now - lastCallTime);
          lastCallTime = now;
          throw new Error('Scrape failed');
        })
      };
      
      const baseDelay = 50; // Use 50ms for measurable delays
      const rateLimitedScraper = new RateLimitedScraper(mockScraper, {
        concurrency: 3,
        maxRetries: 2,
        retryDelayMs: baseDelay
      });
      
      await rateLimitedScraper.scrapeSport(1, 'Football');
      
      // First call has no delay, second should have ~baseDelay, third should have ~baseDelay*2
      // Allow some tolerance for timing variations
      expect(delays[1]).toBeGreaterThanOrEqual(baseDelay * 0.8);
      expect(delays[2]).toBeGreaterThanOrEqual(baseDelay * 2 * 0.8);
    });

    it('should not retry when maxRetries is 0', async () => {
      const mockScraper = {
        getGamesBySport: jest.fn().mockRejectedValue(new Error('Scrape failed'))
      };
      
      const rateLimitedScraper = new RateLimitedScraper(mockScraper, {
        concurrency: 3,
        maxRetries: 0,
        retryDelayMs: 1
      });
      
      const result = await rateLimitedScraper.scrapeSport(1, 'Football');
      
      expect(mockScraper.getGamesBySport).toHaveBeenCalledTimes(1);
      expect(result.success).toBe(false);
      expect(result.attempts).toBe(1);
    });
  });

  /**
   * Test error inclusion in summary
   * **Validates: Requirements 5.4**
   */
  describe('Error inclusion in summary', () => {
    it('should include failed sports in errors array with error details', async () => {
      const mockScraper = {
        getGamesBySport: jest.fn().mockRejectedValue(new Error('Connection timeout'))
      };
      
      const rateLimitedScraper = new RateLimitedScraper(mockScraper, {
        concurrency: 3,
        maxRetries: 1,
        retryDelayMs: 1
      });
      
      const sports = [
        { id: 1, name: 'Football' },
        { id: 2, name: 'Basketball' }
      ];
      
      const summary = await rateLimitedScraper.scrapeAll(sports);
      
      expect(summary.errors).toHaveLength(2);
      expect(summary.errors[0]).toMatchObject({
        sportId: expect.any(Number),
        sportName: expect.any(String),
        error: 'Connection timeout',
        attempts: 2 // 1 initial + 1 retry
      });
    });

    it('should continue scraping remaining sports after individual failure', async () => {
      let callCount = 0;
      
      const mockScraper = {
        getGamesBySport: jest.fn().mockImplementation(async (sportId) => {
          callCount++;
          if (sportId === 1) {
            throw new Error('Sport 1 failed');
          }
          return [{ id: sportId, game: 'test' }];
        })
      };
      
      const rateLimitedScraper = new RateLimitedScraper(mockScraper, {
        concurrency: 1, // Sequential to ensure order
        maxRetries: 0,
        retryDelayMs: 1
      });
      
      const sports = [
        { id: 1, name: 'Football' },
        { id: 2, name: 'Basketball' },
        { id: 3, name: 'Tennis' }
      ];
      
      const summary = await rateLimitedScraper.scrapeAll(sports);
      
      // All sports should be attempted
      expect(callCount).toBe(3);
      expect(summary.successful).toBe(2);
      expect(summary.failed).toBe(1);
      expect(summary.results).toHaveLength(2);
      expect(summary.errors).toHaveLength(1);
      expect(summary.errors[0].sportName).toBe('Football');
    });

    it('should include correct total counts in summary', async () => {
      const mockScraper = {
        getGamesBySport: jest.fn().mockImplementation(async (sportId) => {
          if (sportId % 2 === 0) {
            throw new Error('Even sport failed');
          }
          return [{ id: sportId }];
        })
      };
      
      const rateLimitedScraper = new RateLimitedScraper(mockScraper, {
        concurrency: 3,
        maxRetries: 0,
        retryDelayMs: 1
      });
      
      const sports = [
        { id: 1, name: 'Sport1' },
        { id: 2, name: 'Sport2' },
        { id: 3, name: 'Sport3' },
        { id: 4, name: 'Sport4' }
      ];
      
      const summary = await rateLimitedScraper.scrapeAll(sports);
      
      expect(summary.total).toBe(4);
      expect(summary.successful).toBe(2); // Odd IDs succeed
      expect(summary.failed).toBe(2); // Even IDs fail
      expect(summary.successful + summary.failed).toBe(summary.total);
    });

    it('should preserve error message in summary', async () => {
      const errorMessage = 'WebSocket connection refused';
      
      const mockScraper = {
        getGamesBySport: jest.fn().mockRejectedValue(new Error(errorMessage))
      };
      
      const rateLimitedScraper = new RateLimitedScraper(mockScraper, {
        concurrency: 3,
        maxRetries: 0,
        retryDelayMs: 1
      });
      
      const sports = [{ id: 1, name: 'Football' }];
      
      const summary = await rateLimitedScraper.scrapeAll(sports);
      
      expect(summary.errors[0].error).toBe(errorMessage);
    });
  });
});
