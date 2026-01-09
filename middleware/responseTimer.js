/**
 * Response Timer Middleware
 * 
 * Tracks and logs API response times for monitoring and performance analysis.
 * Requirements: 6.1, 6.2
 */

/**
 * Default warning threshold in milliseconds (5 seconds)
 */
const DEFAULT_WARN_THRESHOLD_MS = 5000;

/**
 * Metrics storage for response time tracking
 */
class ResponseTimeMetrics {
  constructor() {
    this.responseTimes = [];
    this.slowRequests = 0;
    this.maxStoredTimes = 1000; // Keep last 1000 response times for calculations
  }

  /**
   * Record a response time
   * @param {number} timeMs - Response time in milliseconds
   * @param {boolean} isSlow - Whether this was a slow request
   */
  record(timeMs, isSlow = false) {
    this.responseTimes.push(timeMs);
    
    // Keep only the last maxStoredTimes entries to prevent memory growth
    if (this.responseTimes.length > this.maxStoredTimes) {
      this.responseTimes.shift();
    }
    
    if (isSlow) {
      this.slowRequests++;
    }
  }

  /**
   * Calculate average response time
   * @returns {number} Average response time in milliseconds
   */
  getAverage() {
    if (this.responseTimes.length === 0) {
      return 0;
    }
    const sum = this.responseTimes.reduce((a, b) => a + b, 0);
    return Math.round(sum / this.responseTimes.length);
  }

  /**
   * Calculate 95th percentile response time
   * @returns {number} P95 response time in milliseconds
   */
  getP95() {
    if (this.responseTimes.length === 0) {
      return 0;
    }
    const sorted = [...this.responseTimes].sort((a, b) => a - b);
    const index = Math.ceil(sorted.length * 0.95) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * Get metrics summary for health endpoint
   * @returns {Object} Metrics object with avg, p95, slowRequests
   */
  getStats() {
    return {
      avg: this.getAverage(),
      p95: this.getP95(),
      slowRequests: this.slowRequests
    };
  }

  /**
   * Reset all metrics
   */
  reset() {
    this.responseTimes = [];
    this.slowRequests = 0;
  }
}

// Singleton metrics instance
const metrics = new ResponseTimeMetrics();

/**
 * Creates a response timer middleware
 * 
 * @param {Object} options - Configuration options
 * @param {number} options.warnThresholdMs - Threshold for slow response warnings (default: 5000ms)
 * @param {Function} options.logger - Custom logger function (default: console.warn)
 * @returns {Function} Express middleware function
 */
function createResponseTimerMiddleware(options = {}) {
  const {
    warnThresholdMs = DEFAULT_WARN_THRESHOLD_MS,
    logger = console.warn
  } = options;

  return function responseTimer(req, res, next) {
    const startTime = process.hrtime.bigint();

    // Override res.end to capture response completion
    const originalEnd = res.end;
    res.end = function(...args) {
      const endTime = process.hrtime.bigint();
      const durationNs = Number(endTime - startTime);
      const durationMs = Math.round(durationNs / 1e6);

      // Only set header if headers haven't been sent yet
      if (!res.headersSent) {
        res.setHeader('X-Response-Time', `${durationMs}ms`);
      }

      // Check if response is slow
      const isSlow = durationMs > warnThresholdMs;
      
      // Record metrics
      metrics.record(durationMs, isSlow);

      // Log warning for slow responses
      if (isSlow) {
        logger(`Slow response detected: ${req.method} ${req.originalUrl || req.url} took ${durationMs}ms (threshold: ${warnThresholdMs}ms)`);
      }

      // Call original end
      return originalEnd.apply(this, args);
    };

    next();
  };
}

/**
 * Pre-configured response timer middleware with default settings
 * - Adds X-Response-Time header to all responses
 * - Logs warnings for responses > 5 seconds
 * - Tracks metrics for health endpoint
 */
const responseTimerMiddleware = createResponseTimerMiddleware();

/**
 * Get current response time metrics
 * @returns {Object} Metrics object with avg, p95, slowRequests
 */
function getMetrics() {
  return metrics.getStats();
}

/**
 * Reset response time metrics
 */
function resetMetrics() {
  metrics.reset();
}

module.exports = {
  createResponseTimerMiddleware,
  responseTimerMiddleware,
  getMetrics,
  resetMetrics,
  ResponseTimeMetrics,
  DEFAULT_WARN_THRESHOLD_MS
};
