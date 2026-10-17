const { PrismaClient } = require('@prisma/client');
const { env } = require('../config/env');
const { logger } = require('./logger');

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

module.exports = { prisma };
