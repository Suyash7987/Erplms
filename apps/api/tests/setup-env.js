const { resolveTestDatabaseUrl } = require('./helpers/test-database-url');

// Forced (not defaulted): Prisma loads apps/api/.env into process.env, which must not leak into tests.
Object.assign(process.env, {
  NODE_ENV: 'test',
  LOG_LEVEL: process.env.TEST_LOG_LEVEL || 'silent',
  WEB_ORIGIN: 'http://localhost:3000',
  RATE_LIMIT_MAX: '10000',
  BCRYPT_ROUNDS: '4',
  JWT_ACCESS_SECRET: 'test-access-secret-0123456789abcdefghijklmnop',
  JWT_REFRESH_SECRET: 'test-refresh-secret-0123456789abcdefghijklmno',
  LOGIN_MAX_ATTEMPTS: '5',
  LOGIN_LOCK_MINUTES: '15',
  LOGIN_RATE_LIMIT_PER_ACCOUNT: '10000',
  LOGIN_RATE_LIMIT_PER_IP: '10000',
  DATABASE_URL: resolveTestDatabaseUrl(),
});
