/**
 * HTTP Response Compression Middleware
 * 
 * Configures gzip compression for HTTP responses to reduce network transfer times.
 * Requirements: 4.1, 4.2, 4.3
 */

const compression = require('compression');

/**
 * Default compression threshold in bytes (1KB)
 * Responses smaller than this will not be compressed
 */
const DEFAULT_THRESHOLD = 1024;

/**
 * Creates a configured compression middleware instance
 * 
 * @param {Object} options - Configuration options
 * @param {number} options.threshold - Minimum response size to compress (default: 1024 bytes)
 * @param {number} options.level - Compression level 1-9 (default: 6)
 * @returns {Function} Express middleware function
 */
function createCompressionMiddleware(options = {}) {
  const {
    threshold = DEFAULT_THRESHOLD,
    level = 6
  } = options;

  return compression({
    // Only compress responses larger than threshold (1KB by default)
    threshold: threshold,
    
    // Compression level (1-9, higher = better compression but slower)
    level: level,
    
    // Filter function to determine if response should be compressed
    // Returns true if compression should be applied
    filter: (req, res) => {
      const path = String(req?.path || '');
      
      // Don't compress SSE streams - compression breaks EventSource parsing
      if (path.endsWith('-stream')) {
        return false;
      }
      
      if (path.startsWith('/api/live-tracker')) {
        return false;
      }

      // Check if client supports compression via Accept-Encoding header
      const acceptEncoding = req.headers['accept-encoding'] || '';
      
      // If client doesn't support gzip or deflate, don't compress
      if (!acceptEncoding.includes('gzip') && !acceptEncoding.includes('deflate')) {
        return false;
      }
      
      // Use default compression filter for content-type checking
      return compression.filter(req, res);
    }
  });
}

/**
 * Pre-configured compression middleware with default settings
 * - Compresses responses > 1KB
 * - Sets Content-Encoding header automatically
 * - Handles clients without compression support
 */
const compressionMiddleware = createCompressionMiddleware();

module.exports = {
  createCompressionMiddleware,
  compressionMiddleware,
  DEFAULT_THRESHOLD
};
