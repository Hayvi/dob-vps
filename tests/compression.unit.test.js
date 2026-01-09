/**
 * Unit tests for Compression Middleware edge cases
 * Feature: performance-optimization
 * 
 * **Validates: Requirements 4.2**
 */
const express = require('express');
const http = require('http');
const { createCompressionMiddleware, DEFAULT_THRESHOLD } = require('../middleware/compression');

describe('Compression Middleware Unit Tests', () => {
  /**
   * Helper to create a test Express app with compression middleware
   */
  function createTestApp(responseBody, options = {}) {
    const app = express();
    app.use(createCompressionMiddleware(options));
    
    app.get('/test', (req, res) => {
      if (typeof responseBody === 'object') {
        res.json(responseBody);
      } else {
        res.send(responseBody);
      }
    });
    
    return app;
  }

  /**
   * Helper to make a request and get response with headers
   */
  function makeRequest(app, acceptEncoding) {
    return new Promise((resolve, reject) => {
      const server = app.listen(0, () => {
        const port = server.address().port;
        
        const headers = {};
        if (acceptEncoding !== undefined) {
          headers['Accept-Encoding'] = acceptEncoding;
        }

        const options = {
          hostname: 'localhost',
          port: port,
          path: '/test',
          method: 'GET',
          headers: headers
        };

        const req = http.request(options, (res) => {
          const chunks = [];
          res.on('data', chunk => chunks.push(chunk));
          res.on('end', () => {
            server.close();
            resolve({
              headers: res.headers,
              body: Buffer.concat(chunks),
              statusCode: res.statusCode
            });
          });
        });

        req.on('error', (err) => {
          server.close();
          reject(err);
        });

        req.end();
      });
    });
  }

  describe('Small Response (< 1KB) Not Compressed', () => {
    it('should NOT compress responses smaller than 1KB threshold', async () => {
      // Create a small response body (less than 1KB)
      const smallBody = 'Hello, World!'; // 13 bytes
      
      const app = createTestApp(smallBody);
      const response = await makeRequest(app, 'gzip');

      // Should NOT have gzip encoding for small responses
      expect(response.headers['content-encoding']).toBeUndefined();
      
      // Body should be the original uncompressed content
      expect(response.body.toString()).toBe(smallBody);
    });

    it('should NOT compress JSON responses smaller than 1KB', async () => {
      // Create a small JSON response
      const smallJson = { message: 'Hello', status: 'ok' };
      
      const app = createTestApp(smallJson);
      const response = await makeRequest(app, 'gzip');

      // Should NOT have gzip encoding
      expect(response.headers['content-encoding']).toBeUndefined();
      
      // Body should be parseable JSON
      const parsed = JSON.parse(response.body.toString());
      expect(parsed).toEqual(smallJson);
    });

    it('should compress response exactly at threshold boundary', async () => {
      // Create a response body exactly at 1KB (1024 bytes)
      const boundaryBody = 'x'.repeat(1024);
      
      const app = createTestApp(boundaryBody);
      const response = await makeRequest(app, 'gzip');

      // At exactly threshold, compression library compresses (threshold is inclusive)
      expect(response.headers['content-encoding']).toBe('gzip');
    });

    it('should compress response just above threshold', async () => {
      // Create a response body just above 1KB
      const largeBody = 'x'.repeat(1100);
      
      const app = createTestApp(largeBody);
      const response = await makeRequest(app, 'gzip');

      // Should have gzip encoding for responses above threshold
      expect(response.headers['content-encoding']).toBe('gzip');
    });
  });

  describe('Client Without Accept-Encoding Header', () => {
    it('should NOT compress when client sends no Accept-Encoding header', async () => {
      // Create a large response that would normally be compressed
      const largeBody = 'x'.repeat(2000);
      
      const app = createTestApp(largeBody);
      // Pass undefined to not include Accept-Encoding header
      const response = await makeRequest(app, undefined);

      // Should NOT have gzip encoding
      expect(response.headers['content-encoding']).toBeUndefined();
      
      // Body should be the original uncompressed content
      expect(response.body.toString()).toBe(largeBody);
    });

    it('should NOT compress when client sends empty Accept-Encoding header', async () => {
      const largeBody = 'x'.repeat(2000);
      
      const app = createTestApp(largeBody);
      const response = await makeRequest(app, '');

      // Should NOT have gzip encoding
      expect(response.headers['content-encoding']).toBeUndefined();
      
      // Body should be the original uncompressed content
      expect(response.body.toString()).toBe(largeBody);
    });

    it('should NOT compress when client only accepts unsupported encoding', async () => {
      const largeBody = 'x'.repeat(2000);
      
      const app = createTestApp(largeBody);
      const response = await makeRequest(app, 'br'); // brotli only

      // Should NOT have gzip encoding (our middleware only checks for gzip/deflate)
      expect(response.headers['content-encoding']).toBeUndefined();
    });

    it('should compress when client accepts deflate', async () => {
      const largeBody = 'x'.repeat(2000);
      
      const app = createTestApp(largeBody);
      const response = await makeRequest(app, 'deflate');

      // Should have deflate encoding
      expect(response.headers['content-encoding']).toBe('deflate');
    });
  });

  describe('DEFAULT_THRESHOLD constant', () => {
    it('should export DEFAULT_THRESHOLD as 1024 bytes', () => {
      expect(DEFAULT_THRESHOLD).toBe(1024);
    });
  });
});
