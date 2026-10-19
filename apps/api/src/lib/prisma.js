const { PrismaClient } = require('@prisma/client');
const { env } = require('../config/env');
const { logger } = require('./logger');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DEFAULT_TX_OPTIONS = { maxWait: 5_000, timeout: 10_000 };

function createPrismaClient() {
  const client = new PrismaClient({
    log: [
      { emit: 'event', level: 'warn' },
      { emit: 'event', level: 'error' },
    ],
  });
  client.$on('warn', (event) => logger.warn({ prisma: event }, 'prisma warning'));
  client.$on('error', (event) => logger.error({ prisma: event }, 'prisma error'));
  return client;
}

// Reuse one client across `node --watch` reloads in development to avoid exhausting connections.
const prisma = globalThis.__erplmsPrisma ?? createPrismaClient();
if (!env.isProduction) {
  globalThis.__erplmsPrisma = prisma;
}

/**
 * Runs `work(tx)` in a transaction scoped to one institute. Row Level Security (prisma/rls.sql)
 * limits every tenant table to rows whose institute_id matches, so a forgotten filter cannot leak
 * another institute's data. Services should still filter by instituteId as a second layer.
 *
 * The bare `prisma` client has no tenant context: tenant tables return no rows and reject writes.
 *
 * @template T
 * @param {string} instituteId institute UUID, taken only from a verified JWT (or trusted code)
 * @param {(tx: import('@prisma/client').Prisma.TransactionClient) => Promise<T>} work
 * @param {{ maxWait?: number, timeout?: number, isolationLevel?: string }} [options]
 * @returns {Promise<T>}
 */
async function withTenant(instituteId, work, options = {}) {
  if (typeof instituteId !== 'string' || !UUID_PATTERN.test(instituteId)) {
    throw new TypeError('withTenant() requires a valid institute UUID');
  }
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.institute_id', ${instituteId}, true)`;
      return work(tx);
    },
    { ...DEFAULT_TX_OPTIONS, ...options },
  );
}

/**
 * Runs `work(tx)` with platform access, which RLS honours only for SELECT on `institutes`
 * (for example, resolving the institute code typed at login). All other tables stay closed.
 *
 * @template T
 * @param {(tx: import('@prisma/client').Prisma.TransactionClient) => Promise<T>} work
 * @returns {Promise<T>}
 */
async function withPlatform(work) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.platform', 'on', true)`;
    return work(tx);
  }, DEFAULT_TX_OPTIONS);
}

/**
 * Superusers and BYPASSRLS roles ignore Row Level Security, which would silently disable tenant
 * isolation. Returns true when the connected role is safe to use.
 */
async function isRlsEnforcedForCurrentRole() {
  const [role] = await prisma.$queryRaw`
    SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`;
  return Boolean(role) && !role.rolsuper && !role.rolbypassrls;
}

module.exports = { prisma, withTenant, withPlatform, isRlsEnforcedForCurrentRole, UUID_PATTERN };
