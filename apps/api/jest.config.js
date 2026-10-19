const shared = {
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/tests/setup-env.js'],
  clearMocks: true,
};

module.exports = {
  collectCoverageFrom: ['src/**/*.js', '!src/server.js'],
  projects: [
    { ...shared, displayName: 'unit', roots: ['<rootDir>/tests/unit'] },
    {
      ...shared,
      displayName: 'integration',
      roots: ['<rootDir>/tests/integration'],
      // Recreates the *_test database and applies all migrations before the integration tests.
      globalSetup: '<rootDir>/tests/integration/global-setup.js',
    },
  ],
};
