const { env } = require('../config/env');
const { QUEUE_NAMES, getQueue } = require('../lib/queue');

/**
 * Repeatable (cron) jobs. Patterns are evaluated in the institute timezone (IST by default),
 * so "0 9 * * *" means 09:00 IST, not 09:00 UTC.
 */
const SCHEDULES = [
  {
    queue: QUEUE_NAMES.SYSTEM,
    id: 'system-heartbeat',
    pattern: '*/5 * * * *',
    job: { name: 'heartbeat', data: {} },
  },
];

async function registerSchedulers() {
  for (const schedule of SCHEDULES) {
    await getQueue(schedule.queue).upsertJobScheduler(
      schedule.id,
      { pattern: schedule.pattern, tz: env.APP_TIMEZONE },
      schedule.job,
    );
  }
  return SCHEDULES.map((schedule) => schedule.id);
}

module.exports = { SCHEDULES, registerSchedulers };
