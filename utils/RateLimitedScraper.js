/**
 * RateLimitedScraper - Concurrent scraping with rate limiting and retry logic
 * 
 * Wraps a ForzzaScraper instance to provide controlled concurrent scraping
 * with configurable concurrency limits, retry behavior, and progress tracking.
 */
class RateLimitedScraper {
  /**
   * Create a new RateLimitedScraper instance
   * @param {Object} scraper - ForzzaScraper instance to wrap
   * @param {Object} options - Configuration options
   * @param {number} [options.concurrency=3] - Maximum concurrent scraping operations
   * @param {number} [options.maxRetries=2] - Maximum retry attempts per sport
   * @param {number} [options.retryDelayMs=1000] - Base delay between retries in milliseconds
   */
  constructor(scraper, options = {}) {
    this.scraper = scraper;
    this.concurrency = options.concurrency ?? 3;
    this.maxRetries = options.maxRetries ?? 2;
    this.retryDelayMs = options.retryDelayMs ?? 1000;
    
    // Track active operations for concurrency enforcement
    this.activeCount = 0;
    this.queue = [];
  }

  /**
   * Sleep for a specified duration
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise<void>}
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Calculate exponential backoff delay
   * @param {number} attempt - Current attempt number (0-indexed)
   * @returns {number} Delay in milliseconds
   */
  _getBackoffDelay(attempt) {
    return this.retryDelayMs * Math.pow(2, attempt);
  }

  /**
   * Execute a function with concurrency control
   * @param {Function} fn - Async function to execute
   * @returns {Promise<*>} Result of the function
   */
  async _withConcurrencyLimit(fn) {
    // Wait if at concurrency limit
    while (this.activeCount >= this.concurrency) {
      await new Promise(resolve => {
        this.queue.push(resolve);
      });
    }

    this.activeCount++;
    try {
      return await fn();
    } finally {
      this.activeCount--;
      // Release next waiting operation
      if (this.queue.length > 0) {
        const next = this.queue.shift();
        next();
      }
    }
  }

  /**
   * Scrape a single sport with retry logic and exponential backoff
   * @param {number|string} sportId - Sport ID to scrape
   * @param {string} sportName - Sport name for logging/reporting
   * @returns {Promise<Object>} Result object with success status, data or error
   */
  async scrapeSport(sportId, sportName) {
    let lastError = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        // Apply backoff delay for retries (not first attempt)
        if (attempt > 0) {
          const delay = this._getBackoffDelay(attempt - 1);
          await this._sleep(delay);
        }

        const data = await this.scraper.getGamesBySport(sportId);
        
        return {
          success: true,
          sportId,
          sportName,
          data,
          attempts: attempt + 1
        };
      } catch (error) {
        lastError = error;
        console.warn(`Scrape attempt ${attempt + 1}/${this.maxRetries + 1} failed for ${sportName}: ${error.message}`);
      }
    }

    // All retries exhausted
    return {
      success: false,
      sportId,
      sportName,
      error: lastError?.message || 'Unknown error',
      attempts: this.maxRetries + 1
    };
  }


  /**
   * Scrape multiple sports with progress tracking and concurrency control
   * @param {Array<{id: number|string, name: string}>} sports - Array of sports to scrape
   * @param {Function} [onProgress] - Optional callback for progress updates
   *   Called with: { completed: number, total: number, current: string, success: boolean }
   * @returns {Promise<Object>} Summary object with results and errors
   */
  async scrapeAll(sports, onProgress) {
    const total = sports.length;
    let completed = 0;
    const results = [];
    const errors = [];

    // Create scrape tasks for all sports
    const scrapePromises = sports.map(sport => {
      return this._withConcurrencyLimit(async () => {
        const result = await this.scrapeSport(sport.id, sport.name);
        
        completed++;
        
        // Track results
        if (result.success) {
          results.push(result);
        } else {
          errors.push({
            sportId: result.sportId,
            sportName: result.sportName,
            error: result.error,
            attempts: result.attempts
          });
        }

        // Call progress callback if provided
        if (onProgress) {
          onProgress({
            completed,
            total,
            current: sport.name,
            success: result.success
          });
        }

        return result;
      });
    });

    // Wait for all scrapes to complete
    await Promise.all(scrapePromises);

    return {
      total,
      successful: results.length,
      failed: errors.length,
      results,
      errors
    };
  }
}

module.exports = RateLimitedScraper;
