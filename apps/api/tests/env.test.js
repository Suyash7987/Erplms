const { parseEnv } = require('../src/config/env');

const base = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  WEB_ORIGIN: 'http://localhost:3000',
};

describe('environment validation', () => {
  test('applies defaults for optional values', () => {
    const env = parseEnv(base);

    expect(env).toMatchObject({
      NODE_ENV: 'development',
      PORT: 4000,
      APP_TIMEZONE: 'Asia/Kolkata',
      RATE_LIMIT_MAX: 300,
      isDevelopment: true,
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

  test('requires a valid web origin for CORS', () => {
    expect(() => parseEnv({ ...base, WEB_ORIGIN: 'not-a-url' })).toThrow(/WEB_ORIGIN/);
  });
});
