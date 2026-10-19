const fs = require('node:fs');
const path = require('node:path');
const { parseEnv } = require('node:util');

const FALLBACK_URL = 'postgresql://erplms:erplms_dev_password@localhost:5432/erplms?schema=public';

/**
 * Tests never use DATABASE_URL directly, so they cannot touch the development database.
 * Order: TEST_DATABASE_URL, else DATABASE_URL from apps/api/.env with "_test" appended to the
 * database name, else the README defaults. The database name must end in "_test" because the
 * integration setup drops and recreates it.
 */
function resolveTestDatabaseUrl() {
  let url = process.env.TEST_DATABASE_URL;

  if (!url) {
    const envFile = path.resolve(__dirname, '../../.env');
    const fromFile = fs.existsSync(envFile)
      ? parseEnv(fs.readFileSync(envFile, 'utf8')).DATABASE_URL
      : undefined;
    const parsed = new URL(fromFile || FALLBACK_URL);
    const name = parsed.pathname.slice(1);
    if (!name.endsWith('_test')) parsed.pathname = `/${name}_test`;
    url = parsed.toString();
  }

  const name = new URL(url).pathname.slice(1);
  if (!/^[a-z0-9_]+_test$/.test(name)) {
    throw new Error(`Refusing to use test database "${name}": the name must end in _test`);
  }
  return url;
}

module.exports = { resolveTestDatabaseUrl };
