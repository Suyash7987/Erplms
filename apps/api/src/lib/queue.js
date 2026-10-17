const { Queue } = require('bullmq');
const { createRedisConnection } = require('./redis');

const QUEUE_NAMES = Object.freeze({
  SYSTEM: 'system',
});

const DEFAULT_JOB_OPTIONS = Object.freeze({
  attempts: 3,
  backoff: { type: 'exponential', delay: 5_000 },
  removeOnComplete: { count: 1_000 },
  removeOnFail: { count: 5_000 },
});

const queues = new Map();

function getQueue(name) {
  if (!Object.values(QUEUE_NAMES).includes(name)) {
    throw new Error(`Unknown queue: ${name}`);
  }
  if (!queues.has(name)) {
    queues.set(
      name,
      new Queue(name, {
        connection: createRedisConnection({ maxRetriesPerRequest: null }),
        defaultJobOptions: DEFAULT_JOB_OPTIONS,
      }),
    );
  }
  return queues.get(name);
}

async function closeQueues() {
  await Promise.all([...queues.values()].map((queue) => queue.close()));
  queues.clear();
}

module.exports = { QUEUE_NAMES, DEFAULT_JOB_OPTIONS, getQueue, closeQueues };
