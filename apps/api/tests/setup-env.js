const { resolveTestDatabaseUrl } = require('./helpers/test-database-url');

// Forced (not defaulted): Prisma loads apps/api/.env into process.env, which must not leak into tests.
Object.assign(process.env, {
  NODE_ENV: 'test',
  LOG_LEVEL: process.env.TEST_LOG_LEVEL || 'silent',
  WEB_ORIGIN: 'http://localhost:3000',
  RATE_LIMIT_MAX: '10000',
  BCRYPT_ROUNDS: '4',
  DATABASE_URL: resolveTestDatabaseUrl(),
});
