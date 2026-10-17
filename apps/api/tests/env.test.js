const { parseEnv } = require('../src/config/env');

const base = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
  WEB_ORIGIN: 'http://localhost:3000',
};

describe('environment validation', () => {
  test('applies defaults for optional values', () => {
    const env = parseEnv(base);

    expect(env).toMatchObject({
      NODE_ENV: 'development',
      PORT: 4000,
      APP_TIMEZONE: 'Asia/Kolkata',
      SWAGGER_ENABLED: true,
      SENTRY_DSN: undefined,
    });
    expect(Object.isFrozen(env)).toBe(true);
  });

  test('fails fast with a readable list of problems', () => {
    expect(() => parseEnv({ ...base, DATABASE_URL: undefined, PORT: 'abc' })).toThrow(
      /DATABASE_URL[\s\S]*PORT|PORT[\s\S]*DATABASE_URL/,
    );
  });

  test('rejects non-postgres database URLs', () => {
    expect(() => parseEnv({ ...base, DATABASE_URL: 'mysql://localhost/db' })).toThrow(
      /DATABASE_URL: must be a postgres/,
    );
  });

  test('disables Swagger in production unless explicitly enabled', () => {
    expect(parseEnv({ ...base, NODE_ENV: 'production' }).SWAGGER_ENABLED).toBe(false);
    expect(
      parseEnv({ ...base, NODE_ENV: 'production', SWAGGER_ENABLED: 'true' }).SWAGGER_ENABLED,
    ).toBe(true);
  });

  test('treats an empty SENTRY_DSN as disabled', () => {
    expect(parseEnv({ ...base, SENTRY_DSN: '' }).SENTRY_DSN).toBeUndefined();
  });
});
