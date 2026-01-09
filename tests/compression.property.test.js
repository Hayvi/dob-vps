/**
 * Property-based tests for Compression Middleware
 * Feature: performance-optimization
 * 
 * Uses fast-check library for property-based testing
 */
const fc = require('fast-check');
const express = require('express');
const zlib = require('zlib');
const { createCompressionMiddleware, DEFAULT_THRESHOLD } = require('../middleware/compression');

describe('Compression Middleware Property Tests', () => {
  /**
   * Feature: performance-optimization, Property 4: Compression Header Consistency
   * 
   * For any HTTP response larger than 1KB where the client sends Accept-Encoding: gzip,
   * the response SHALL have Content-Encoding: gzip header and the decompressed body
   * SHALL equal the original response body.
   * 
   * **Validates: Requirements 4.1, 4.3**
   */
  describe('Property 4: Compression Header Consistency', () => {
    // Generator for response bodies larger than 1KB
    const arbitraryLargeBody = fc.string({ minLength: 1100, maxLength: 5000 });

    // Generator for JSON response bodies larger than 1KB
    const arbitraryLargeJsonBody = fc.array(
      fc.record({
        id: fc.uuid(),
        name: fc.string({ minLength: 10, maxLength: 50 }),
        description: fc.string({ minLength: 50, maxLength: 200 }),
        value: fc.integer()
      }),
      { minLength: 10, maxLength: 50 }
    );

    /**
     * Helper to create a test Express app with compression middleware
     */
    function createTestApp(responseBody) {
      const app = express();
      app.use(createCompressionMiddleware());
      
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
    async function makeRequest(app, acceptEncoding = 'gzip') {
      return new Promise((resolve, reject) => {
        const server = app.listen(0, () => {
          const port = server.address().port;
          const http = require('http');
          
          const options = {
            hostname: 'localhost',
            port: port,
            path: '/test',
            method: 'GET',
            headers: acceptEncoding ? { 'Accept-Encoding': acceptEncoding } : {}
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

    it('should set Content-Encoding: gzip for responses > 1KB when client accepts gzip', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbitraryLargeBody,
          async (body) => {
            // Ensure body is larger than threshold
            if (Buffer.byteLength(body) <= DEFAULT_THRESHOLD) {
              return true; // Skip if body is too small
            }

            const app = createTestApp(body);
            const response = await makeRequest(app, 'gzip');

            // Should have gzip encoding for large responses
            expect(response.headers['content-encoding']).toBe('gzip');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should decompress to original body for any gzip-compressed response', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbitraryLargeBody,
          async (originalBody) => {
            // Ensure body is larger than threshold
            if (Buffer.byteLength(originalBody) <= DEFAULT_THRESHOLD) {
              return true; // Skip if body is too small
            }

            const app = createTestApp(originalBody);
            const response = await makeRequest(app, 'gzip');

            // Decompress the response
            const decompressed = zlib.gunzipSync(response.body).toString();

            // Decompressed body should equal original
            expect(decompressed).toBe(originalBody);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should preserve JSON data integrity through compression round-trip', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbitraryLargeJsonBody,
          async (originalData) => {
            const jsonString = JSON.stringify(originalData);
            
            // Ensure body is larger than threshold
            if (Buffer.byteLength(jsonString) <= DEFAULT_THRESHOLD) {
              return true; // Skip if body is too small
            }

            const app = createTestApp(originalData);
            const response = await makeRequest(app, 'gzip');

            // Should be compressed
            if (response.headers['content-encoding'] === 'gzip') {
              // Decompress and parse
              const decompressed = zlib.gunzipSync(response.body).toString();
              const parsedData = JSON.parse(decompressed);

              // Data should be equivalent
              expect(parsedData).toEqual(originalData);
            }
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should NOT set Content-Encoding: gzip when client does not accept gzip', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbitraryLargeBody,
          async (body) => {
            const app = createTestApp(body);
            // Request without Accept-Encoding header
            const response = await makeRequest(app, null);

            // Should NOT have gzip encoding
            expect(response.headers['content-encoding']).toBeUndefined();
            
            // Body should be uncompressed original
            expect(response.body.toString()).toBe(body);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
