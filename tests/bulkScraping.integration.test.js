/**
 * Integration tests for bulk scraping with RateLimitedScraper
 * Feature: performance-optimization
 * 
 * Tests the /api/fetch-all-sports endpoint behavior with rate-limited concurrent scraping
 * 
 * **Validates: Requirements 5.1, 5.2, 5.4**
 */
const RateLimitedScraper = require('../utils/RateLimitedScraper');

describe('Bulk Scraping Integration Tests', () => {
  /**
   * Test concurrency limit is respected
   * **Validates: Requirements 5.1**
   */
  describe('Concurrency Limit Enforcement', () => {
    it('should never exceed max concurrency of 3 during bulk scraping', async () => {
      let maxConcurrent = 0;
      let currentConcurrent = 0;
      const concurrencyLog = [];

      const mockScraper = {
        getGamesBySport: jest.fn().mockImplementation(async (sportId) => {
          currentConcurrent++;
          concurrencyLog.push({ sportId, concurrent: currentConcurrent, action: 'start' });
          maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
          
          // Simulate async work
          await new Promise(resolve => setTimeout(resolve, 20));
          
          currentConcurrent--;
          concurrencyLog.push({ sportId, concurrent: currentConcurrent, action: 'end' });
          return { data: { region: {} } };
        })
      };

      const rateLimitedScraper = new RateLimitedScraper(mockScraper, {
        concurrency: 3,
        maxRetries: 0,
        retryDelayMs: 1
      });

      const sports = [
        { id: 1, name: 'Football' },
        { id: 2, name: 'Basketball' },
        { id: 3, name: 'Tennis' },
        { id: 4, name: 'Cricket' },
        { id: 5, name: 'Golf' },
        { id: 6, name: 'Rugby' }
      ];

      await rateLimitedScraper.scrapeAll(sports);

      expect(maxConcurrent).toBeLessThanOrEqual(3);
      expect(mockScraper.getGamesBySport).toHaveBeenCalledTimes(6);
    });

    it('should process all sports even with concurrency limit', async () => {
      const processedSports = [];

      const mockScraper = {
        getGamesBySport: jest.fn().mockImplementation(async (sportId) => {
          await new Promise(resolve => setTimeout(resolve, 10));
          processedSports.push(sportId);
          return { data: { region: {} } };
        })
      };

      const rateLimitedScraper = new RateLimitedScraper(mockScraper, {
        concurrency: 2,
        maxRetries: 0,
        retryDelayMs: 1
      });

      const sports = [
        { id: 1, name: 'Football' },
        { id: 2, name: 'Basketball' },
        { id: 3, name: 'Tennis' },
        { id: 4, name: 'Cricket' }
      ];

      const result = await rateLimitedScraper.scrapeAll(sports);

      expect(processedSports.length).toBe(4);
      expect(result.total).toBe(4);
      expect(result.successful).toBe(4);
    });
  });

  /**
   * Test error handling and retry behavior
   * **Validates: Requirements 5.2, 5.4**
   */
  describe('Error Handling and Retry Behavior', () => {
    it('should retry failed scrapes up to maxRetries times', async () => {
      const attemptCounts = {};

      const mockScraper = {
        getGamesBySport: jest.fn().mockImplementation(async (sportId) => {
          attemptCounts[sportId] = (attemptCounts[sportId] || 0) + 1;
          throw new Error(`Scrape failed for sport ${sportId}`);
        })
      };

      const rateLimitedScraper = new RateLimitedScraper(mockScraper, {
        concurrency: 3,
        maxRetries: 2,
        retryDelayMs: 1
      });

      const sports = [{ id: 1, name: 'Football' }];

      const result = await rateLimitedScraper.scrapeAll(sports);

      // Should attempt 1 initial + 2 retries = 3 total
      expect(attemptCounts[1]).toBe(3);
      expect(result.failed).toBe(1);
      expect(result.errors[0].attempts).toBe(3);
    });

    it('should continue scraping remaining sports after individual failure', async () => {
      const mockScraper = {
        getGamesBySport: jest.fn().mockImplementation(async (sportId) => {
          if (sportId === 2) {
            throw new Error('Sport 2 failed');
          }
          return { data: { region: {} } };
        })
      };

      const rateLimitedScraper = new RateLimitedScraper(mockScraper, {
        concurrency: 3,
        maxRetries: 0,
        retryDelayMs: 1
      });

      const sports = [
        { id: 1, name: 'Football' },
        { id: 2, name: 'Basketball' },
        { id: 3, name: 'Tennis' }
      ];

      const result = await rateLimitedScraper.scrapeAll(sports);

      expect(result.total).toBe(3);
      expect(result.successful).toBe(2);
      expect(result.failed).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].sportName).toBe('Basketball');
    });

    it('should include error details in summary for failed sports', async () => {
      const errorMessage = 'WebSocket connection timeout';

      const mockScraper = {
        getGamesBySport: jest.fn().mockRejectedValue(new Error(errorMessage))
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

      const result = await rateLimitedScraper.scrapeAll(sports);

      expect(result.errors).toHaveLength(2);
      expect(result.errors[0]).toMatchObject({
        sportId: expect.any(Number),
        sportName: expect.any(String),
        error: errorMessage,
        attempts: 2
      });
    });

    it('should succeed on retry if subsequent attempt succeeds', async () => {
      const attemptCounts = {};

      const mockScraper = {
        getGamesBySport: jest.fn().mockImplementation(async (sportId) => {
          attemptCounts[sportId] = (attemptCounts[sportId] || 0) + 1;
          if (attemptCounts[sportId] < 2) {
            throw new Error('Temporary failure');
          }
          return { data: { region: {} } };
        })
      };

      const rateLimitedScraper = new RateLimitedScraper(mockScraper, {
        concurrency: 3,
        maxRetries: 2,
        retryDelayMs: 1
      });

      const sports = [{ id: 1, name: 'Football' }];

      const result = await rateLimitedScraper.scrapeAll(sports);

      expect(result.successful).toBe(1);
      expect(result.failed).toBe(0);
      expect(result.results[0].attempts).toBe(2);
    });

    it('should handle mixed success and failure scenarios', async () => {
      const mockScraper = {
        getGamesBySport: jest.fn().mockImplementation(async (sportId) => {
          // Odd IDs succeed, even IDs fail
          if (sportId % 2 === 0) {
            throw new Error(`Sport ${sportId} failed`);
          }
          return { data: { region: {} } };
        })
      };

      const rateLimitedScraper = new RateLimitedScraper(mockScraper, {
        concurrency: 3,
        maxRetries: 0,
        retryDelayMs: 1
      });

      const sports = [
        { id: 1, name: 'Football' },
        { id: 2, name: 'Basketball' },
        { id: 3, name: 'Tennis' },
        { id: 4, name: 'Cricket' }
      ];

      const result = await rateLimitedScraper.scrapeAll(sports);

      expect(result.total).toBe(4);
      expect(result.successful).toBe(2);
      expect(result.failed).toBe(2);
      expect(result.successful + result.failed).toBe(result.total);
    });
  });

  /**
   * Test progress tracking during bulk operations
   * **Validates: Requirements 5.3**
   */
  describe('Progress Tracking', () => {
    it('should track progress correctly during bulk scraping', async () => {
      const progressUpdates = [];

      const mockScraper = {
        getGamesBySport: jest.fn().mockImplementation(async () => {
          await new Promise(resolve => setTimeout(resolve, 5));
          return { data: { region: {} } };
        })
      };

      const rateLimitedScraper = new RateLimitedScraper(mockScraper, {
        concurrency: 2,
        maxRetries: 0,
        retryDelayMs: 1
      });

      const sports = [
        { id: 1, name: 'Football' },
        { id: 2, name: 'Basketball' },
        { id: 3, name: 'Tennis' }
      ];

      const onProgress = (progress) => {
        progressUpdates.push({ ...progress });
      };

      await rateLimitedScraper.scrapeAll(sports, onProgress);

      expect(progressUpdates.length).toBe(3);
      
      // All updates should have correct total
      progressUpdates.forEach(update => {
        expect(update.total).toBe(3);
      });

      // Completed counts should be 1, 2, 3 (in some order due to concurrency)
      const completedCounts = progressUpdates.map(u => u.completed).sort((a, b) => a - b);
      expect(completedCounts).toEqual([1, 2, 3]);
    });
  });
});
