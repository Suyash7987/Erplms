module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  setupFiles: ['<rootDir>/tests/setup-env.js'],
  collectCoverageFrom: ['src/**/*.js', '!src/server.js', '!src/worker/index.js'],
  clearMocks: true,
};
