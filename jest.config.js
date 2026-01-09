module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js', '**/tests/**/*.property.test.js'],
  collectCoverageFrom: [
    'utils/**/*.js',
    'middleware/**/*.js',
    '!**/node_modules/**'
  ],
  verbose: true
};
