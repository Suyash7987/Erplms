process.env.SERVICE_NAME = process.env.SERVICE_NAME || 'worker';
require('../instrument');

const { Worker } = require('bullmq');
const Sentry = require('@sentry/node');
const { env } = require('../config/env');
const { logger } = require('../lib/logger');
const { prisma } = require('../lib/prisma');
const { createRedisConnection, closeRedis } = require('../lib/redis');
const { QUEUE_NAMES, closeQueues } = require('../lib/queue');
const { registerSchedulers } = require('./schedulers');
const { processSystemJob } = require('./processors/system.processor');

const PROCESSORS = [{ queue: QUEUE_NAMES.SYSTEM, processor: processSystemJob, concurrency: 1 }];

const workers = PROCESSORS.map(({ queue, processor, concurrency }) => {
  const worker = new Worker(queue, processor, {
    connection: createRedisConnection({ maxRetriesPerRequest: null }),
    concurrency,
  });

  worker.on('failed', (job, error) => {
    logger.error(
      { queue, jobId: job?.id, jobName: job?.name, attemptsMade: job?.attemptsMade, err: error },
      'job failed',
    );
    if (env.SENTRY_DSN && job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
      Sentry.captureException(error);
    }
  });
  worker.on('error', (error) => logger.error({ queue, err: error }, 'worker error'));

  return worker;
});

registerSchedulers()
  .then((ids) =>
    logger.info({ queues: PROCESSORS.map((p) => p.queue), schedulers: ids }, 'worker started'),
  )
  .catch((error) => logger.error({ err: error }, 'failed to register schedulers'));

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'shutting down worker');
  await Promise.allSettled(workers.map((worker) => worker.close()));
  await Promise.allSettled([closeQueues(), closeRedis(), prisma.$disconnect()]);
  logger.info('worker stopped');
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
