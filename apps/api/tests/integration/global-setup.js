const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');
const { resolveTestDatabaseUrl } = require('../helpers/test-database-url');

/** Drops and recreates the *_test database, then applies every migration (including rls.sql). */
module.exports = async function globalSetup() {
  const testUrl = resolveTestDatabaseUrl();
  const databaseName = new URL(testUrl).pathname.slice(1);

  const maintenanceUrl = new URL(testUrl);
  maintenanceUrl.pathname = '/postgres';
  const admin = new PrismaClient({ datasourceUrl: maintenanceUrl.toString() });
  try {
    await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
    await admin.$executeRawUnsafe(`CREATE DATABASE "${databaseName}"`);
  } catch (error) {
    throw new Error(
      `Could not recreate test database "${databaseName}". The database user needs CREATEDB ` +
        `(see README). Cause: ${error.message}`,
    );
  } finally {
    await admin.$disconnect();
  }

  try {
    execFileSync(
      process.execPath,
      [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'],
      {
        cwd: path.resolve(__dirname, '../..'),
        env: { ...process.env, DATABASE_URL: testUrl },
        stdio: 'pipe',
      },
    );
  } catch (error) {
    throw new Error(`prisma migrate deploy failed:\n${error.stdout}\n${error.stderr}`);
  }
};
