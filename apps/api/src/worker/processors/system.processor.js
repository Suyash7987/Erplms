const { logger } = require('../../lib/logger');
const { toZonedIso } = require('../../lib/time');

const handlers = {
  async heartbeat(job) {
    logger.debug({ jobId: job.id, at: toZonedIso() }, 'worker heartbeat');
    return { ok: true };
  },
};

async function processSystemJob(job) {
  const handler = handlers[job.name];
  if (!handler) {
    throw new Error(`No handler for system job "${job.name}"`);
  }
  return handler(job);
}

module.exports = { processSystemJob };
