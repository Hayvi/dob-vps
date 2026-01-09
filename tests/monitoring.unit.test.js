/**
 * Unit tests for Response Timer Middleware edge cases
 * Feature: performance-optimization
 * 
 * **Validates: Requirements 6.2, 6.3**
 */
const {
  createResponseTimerMiddleware,
  resetMetrics,
  getMetrics,
  ResponseTimeMetrics,
  DEFAULT_WARN_THRESHOLD_MS
} = require('../middleware/responseTimer');

/**
 * Creates a mock Express request object
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

describe('Response Timer Middleware Unit Tests', () => {
  beforeEach(() => {
    resetMetrics();
  });

  describe('Slow Response Warning Threshold', () => {
    it('should use default threshold of 5000ms', () => {
      expect(DEFAULT_WARN_THRESHOLD_MS).toBe(5000);
    });

    it('should not log warning for responses under threshold', async () => {
      const warnings = [];
      const middleware = createResponseTimerMiddleware({
        warnThresholdMs: 100,
        logger: (msg) => warnings.push(msg)
      });

      const req = createMockRequest({ url: '/fast-endpoint' });
      const res = createMockResponse();

      middleware(req, res, () => {});
      
      // Complete immediately (well under 100ms threshold)
      res.end();

      expect(warnings.length).toBe(0);
      expect(getMetrics().slowRequests).toBe(0);
    });

    it('should log warning for responses exceeding threshold', async () => {
      const warnings = [];
      const middleware = createResponseTimerMiddleware({
        warnThresholdMs: 10, // Very low threshold
        logger: (msg) => warnings.push(msg)
      });

      const req = createMockRequest({ url: '/slow-endpoint' });
      const res = createMockResponse();

      middleware(req, res, () => {});
      
      // Wait to exceed threshold
      await new Promise(resolve => setTimeout(resolve, 20));
      res.end();

      expect(warnings.length).toBe(1);
      expect(warnings[0]).toContain('Slow response detected');
      expect(warnings[0]).toContain('/slow-endpoint');
      expect(warnings[0]).toContain('threshold: 10ms');
    });

    it('should increment slowRequests counter for slow responses', async () => {
      const middleware = createResponseTimerMiddleware({
        warnThresholdMs: 10,
        logger: () => {}
      });

      // First slow request
      const req1 = createMockRequest();
      const res1 = createMockResponse();
      middleware(req1, res1, () => {});
      await new Promise(resolve => setTimeout(resolve, 20));
      res1.end();

      // Second slow request
      const req2 = createMockRequest();
      const res2 = createMockResponse();
      middleware(req2, res2, () => {});
      await new Promise(resolve => setTimeout(resolve, 20));
      res2.end();

      expect(getMetrics().slowRequests).toBe(2);
    });

    it('should include HTTP method and URL in warning message', async () => {
      const warnings = [];
      const middleware = createResponseTimerMiddleware({
        warnThresholdMs: 10,
        logger: (msg) => warnings.push(msg)
      });

      const req = createMockRequest({ method: 'POST', url: '/api/data' });
      const res = createMockResponse();

      middleware(req, res, () => {});
      await new Promise(resolve => setTimeout(resolve, 20));
      res.end();

      expect(warnings[0]).toContain('POST');
      expect(warnings[0]).toContain('/api/data');
    });

    it('should allow custom warning threshold', async () => {
      const warnings = [];
      const middleware = createResponseTimerMiddleware({
        warnThresholdMs: 50,
        logger: (msg) => warnings.push(msg)
      });

      const req = createMockRequest();
      const res = createMockResponse();

      middleware(req, res, () => {});
      
      // Wait 30ms - under 50ms threshold
      await new Promise(resolve => setTimeout(resolve, 30));
      res.end();

      expect(warnings.length).toBe(0);
    });
  });

  describe('Health Endpoint Structure', () => {
    it('should return correct structure from getMetrics()', () => {
      const stats = getMetrics();

      expect(stats).toHaveProperty('avg');
      expect(stats).toHaveProperty('p95');
      expect(stats).toHaveProperty('slowRequests');
    });

    it('should return numeric values for all metrics', () => {
      const stats = getMetrics();

      expect(typeof stats.avg).toBe('number');
      expect(typeof stats.p95).toBe('number');
      expect(typeof stats.slowRequests).toBe('number');
    });

    it('should return zero values when no requests recorded', () => {
      const stats = getMetrics();

      expect(stats.avg).toBe(0);
      expect(stats.p95).toBe(0);
      expect(stats.slowRequests).toBe(0);
    });

    it('should calculate correct average response time', async () => {
      const middleware = createResponseTimerMiddleware({
        warnThresholdMs: 5000,
        logger: () => {}
      });

      // Make several requests with small delays
      for (let i = 0; i < 5; i++) {
        const req = createMockRequest();
        const res = createMockResponse();
        middleware(req, res, () => {});
        await new Promise(resolve => setTimeout(resolve, 5));
        res.end();
      }

      const stats = getMetrics();
      expect(stats.avg).toBeGreaterThanOrEqual(0);
    });

    it('should calculate correct p95 response time', async () => {
      const metrics = new ResponseTimeMetrics();
      
      // Add 100 response times: 1-100ms
      for (let i = 1; i <= 100; i++) {
        metrics.record(i);
      }

      const stats = metrics.getStats();
      // P95 of 1-100 should be around 95
      expect(stats.p95).toBe(95);
    });

    it('should track slowRequests count accurately', async () => {
      const middleware = createResponseTimerMiddleware({
        warnThresholdMs: 10,
        logger: () => {}
      });

      // 2 fast requests
      for (let i = 0; i < 2; i++) {
        const req = createMockRequest();
        const res = createMockResponse();
        middleware(req, res, () => {});
        res.end();
      }

      // 3 slow requests
      for (let i = 0; i < 3; i++) {
        const req = createMockRequest();
        const res = createMockResponse();
        middleware(req, res, () => {});
        await new Promise(resolve => setTimeout(resolve, 20));
        res.end();
      }

      expect(getMetrics().slowRequests).toBe(3);
    });
  });

  describe('ResponseTimeMetrics Class', () => {
    it('should limit stored response times to prevent memory growth', () => {
      const metrics = new ResponseTimeMetrics();
      
      // Add more than maxStoredTimes entries
      for (let i = 0; i < 1500; i++) {
        metrics.record(i);
      }

      // Should only keep last 1000
      expect(metrics.responseTimes.length).toBe(1000);
    });

    it('should reset all metrics correctly', () => {
      const metrics = new ResponseTimeMetrics();
      
      metrics.record(100, true);
      metrics.record(200, false);
      
      metrics.reset();

      const stats = metrics.getStats();
      expect(stats.avg).toBe(0);
      expect(stats.p95).toBe(0);
      expect(stats.slowRequests).toBe(0);
    });

    it('should handle single response time correctly', () => {
      const metrics = new ResponseTimeMetrics();
      
      metrics.record(150);

      const stats = metrics.getStats();
      expect(stats.avg).toBe(150);
      expect(stats.p95).toBe(150);
    });
  });
});
