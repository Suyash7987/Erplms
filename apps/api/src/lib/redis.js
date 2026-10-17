const IORedis = require('ioredis');
const { env } = require('../config/env');
const { logger } = require('./logger');

function createRedisConnection(options = {}) {
  const connection = new IORedis(env.REDIS_URL, {
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
    ...options,
  });

  let lastErrorLoggedAt = 0;
  connection.on('error', (error) => {
    const now = Date.now();
    if (now - lastErrorLoggedAt > 10_000) {
      lastErrorLoggedAt = now;
      logger.warn({ err: error }, 'redis connection error');
    }
  });

  return connection;
}

let sharedClient;

/** Shared client for request-path work (OTP, caching, health). Workers create their own. */
function getRedis() {
  if (!sharedClient) {
    sharedClient = createRedisConnection();
  }
  return sharedClient;
}

async function closeRedis() {
  if (sharedClient) {
    await sharedClient.quit().catch(() => sharedClient.disconnect());
    sharedClient = undefined;
  }
}

module.exports = { createRedisConnection, getRedis, closeRedis };
