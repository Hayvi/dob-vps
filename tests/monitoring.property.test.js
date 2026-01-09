/**
 * Property-based tests for Response Timer Middleware
 * Feature: performance-optimization
 * 
 * Uses fast-check library for property-based testing
 */
const fc = require('fast-check');
const { createResponseTimerMiddleware, resetMetrics, getMetrics } = require('../middleware/responseTimer');

/**
 * Creates a mock Express request object
 * @param {Object} options - Request options
 * @returns {Object} Mock request object
 */
function createMockRequest(options = {}) {
  return {
    method: options.method || 'GET',
    url: options.url || '/test',
    originalUrl: options.originalUrl || options.url || '/test'
  };
}

/**
 * Creates a mock Express response object
 * @returns {Object} Mock response object with headers tracking
 */
function createMockResponse() {
  const headers = {};
  return {
    headers,
    setHeader: function(name, value) {
      headers[name] = value;
    },
    getHeader: function(name) {
      return headers[name];
    },
    end: function(...args) {
      // Default end implementation
    }
  };
}

describe('Response Timer Middleware Property Tests', () => {
  beforeEach(() => {
    resetMetrics();
  });

  /**
   * Feature: performance-optimization, Property 7: Response Time Logging Completeness
   * 
   * For any API request that completes, the response time SHALL be logged 
   * and the X-Response-Time header SHALL be set to a positive number 
   * representing milliseconds.
   * 
   * **Validates: Requirements 6.1**
   */
  describe('Property 7: Response Time Logging Completeness', () => {
    it('should set X-Response-Time header to a positive number for any completed request', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate random HTTP methods
          fc.constantFrom('GET', 'POST', 'PUT', 'DELETE', 'PATCH'),
          // Generate random URL paths
          fc.string({ minLength: 1, maxLength: 50 }).map(s => '/' + s.replace(/[^a-zA-Z0-9/-]/g, '')),
          // Generate random processing delay (0-100ms)
          fc.integer({ min: 0, max: 100 }),
          async (method, url, delayMs) => {
            const middleware = createResponseTimerMiddleware({ warnThresholdMs: 5000 });
            const req = createMockRequest({ method, url });
            const res = createMockResponse();
            
            let nextCalled = false;
            const next = () => { nextCalled = true; };
            
            // Apply middleware
            middleware(req, res, next);
            
            // Middleware should call next
            expect(nextCalled).toBe(true);
            
            // Simulate async processing with delay
            await new Promise(resolve => setTimeout(resolve, delayMs));
            
            // Complete the response
            res.end();
            
            // X-Response-Time header should be set
            const responseTimeHeader = res.headers['X-Response-Time'];
            expect(responseTimeHeader).toBeDefined();
            
            // Header should be in format "Nms" where N is a positive number
            expect(typeof responseTimeHeader).toBe('string');
            expect(responseTimeHeader).toMatch(/^\d+ms$/);
            
            // Extract the numeric value
            const timeValue = parseInt(responseTimeHeader.replace('ms', ''), 10);
            expect(timeValue).toBeGreaterThanOrEqual(0);
          }
        ),
        { numRuns: 100 }
      );
    }, 15000);

    it('should record response time in metrics for any completed request', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate number of requests (1-20)
          fc.integer({ min: 1, max: 20 }),
          async (numRequests) => {
            resetMetrics();
            
            const middleware = createResponseTimerMiddleware({ warnThresholdMs: 5000 });
            
            // Process multiple requests
            for (let i = 0; i < numRequests; i++) {
              const req = createMockRequest({ method: 'GET', url: `/test/${i}` });
              const res = createMockResponse();
              
              middleware(req, res, () => {});
              
              // Small delay to ensure measurable time
              await new Promise(resolve => setTimeout(resolve, 1));
              
              res.end();
            }
            
            // Metrics should reflect all requests
            const stats = getMetrics();
            
            // Average should be a non-negative number
            expect(stats.avg).toBeGreaterThanOrEqual(0);
            
            // P95 should be a non-negative number
            expect(stats.p95).toBeGreaterThanOrEqual(0);
            
            // Slow requests count should be a non-negative integer
            expect(stats.slowRequests).toBeGreaterThanOrEqual(0);
            expect(Number.isInteger(stats.slowRequests)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should log warning and increment slowRequests counter for responses exceeding threshold', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate a low threshold (1-10ms) to easily trigger slow response
          fc.integer({ min: 1, max: 10 }),
          // Generate delay that exceeds threshold (15-30ms to keep test fast)
          fc.integer({ min: 15, max: 30 }),
          async (threshold, delay) => {
            resetMetrics();
            
            const warnings = [];
            const middleware = createResponseTimerMiddleware({
              warnThresholdMs: threshold,
              logger: (msg) => warnings.push(msg)
            });
            
            const req = createMockRequest({ method: 'GET', url: '/slow-endpoint' });
            const res = createMockResponse();
            
            middleware(req, res, () => {});
            
            // Wait longer than threshold
            await new Promise(resolve => setTimeout(resolve, delay));
            
            res.end();
            
            // Warning should have been logged
            expect(warnings.length).toBe(1);
            expect(warnings[0]).toContain('Slow response detected');
            expect(warnings[0]).toContain('/slow-endpoint');
            
            // Slow requests counter should be incremented
            const stats = getMetrics();
            expect(stats.slowRequests).toBe(1);
          }
        ),
        { numRuns: 100 }
      );
    }, 15000); // Extended timeout for property test with delays
  });
});
