const pkg = require('../../../package.json');
const { env } = require('../../config/env');
const { prisma } = require('../../lib/prisma');
const { getRedis } = require('../../lib/redis');
const { nowIso, toZonedIso } = require('../../lib/time');

const CHECK_TIMEOUT_MS = 2_000;

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function runCheck(check) {
  const startedAt = performance.now();
  try {
    await withTimeout(check(), CHECK_TIMEOUT_MS);
    return { status: 'ok', latencyMs: Math.round(performance.now() - startedAt) };
  } catch (error) {
    return {
      status: 'error',
      latencyMs: Math.round(performance.now() - startedAt),
      error: env.isProduction ? 'unavailable' : error.message,
    };
  }
}

function liveness() {
  return {
    status: 'ok',
    service: 'api',
    version: pkg.version,
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: nowIso(),
    localTime: toZonedIso(),
    timezone: env.APP_TIMEZONE,
  };
}

async function readiness() {
  const [database, redis] = await Promise.all([
    runCheck(() => prisma.$queryRaw`SELECT 1`),
    runCheck(() => getRedis().ping()),
  ]);

  const checks = { database, redis };
  const healthy = Object.values(checks).every((check) => check.status === 'ok');

  return {
    ...liveness(),
    status: healthy ? 'ok' : 'degraded',
    checks,
  };
}

module.exports = { liveness, readiness };
