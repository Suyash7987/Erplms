require('./instrument');

const { env } = require('./config/env');
const { logger } = require('./lib/logger');
const { prisma } = require('./lib/prisma');
const { closeRedis } = require('./lib/redis');
const { closeQueues } = require('./lib/queue');
const { createApp } = require('./app');

const SHUTDOWN_TIMEOUT_MS = 10_000;

const app = createApp();
const server = app.listen(env.PORT, () => {
  logger.info(
    { port: env.PORT, env: env.NODE_ENV, dataRegion: env.DATA_REGION },
    `API listening on http://localhost:${env.PORT}/api/v1`,
  );
  if (env.isProduction && !/^ap-south-/.test(env.DATA_REGION)) {
    logger.warn({ dataRegion: env.DATA_REGION }, 'production DATA_REGION is not an India region');
  }
});

// Keep connections open longer than typical load balancer idle timeouts (AWS ALB: 60s).
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'shutting down API');

  const forceExit = setTimeout(() => {
    logger.error('graceful shutdown timed out, forcing exit');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExit.unref();

  server.close(async () => {
    await Promise.allSettled([prisma.$disconnect(), closeRedis(), closeQueues()]);
    logger.info('API stopped');
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'unhandled promise rejection');
});
process.on('uncaughtException', (error) => {
  logger.fatal({ err: error }, 'uncaught exception');
  process.exit(1);
});
