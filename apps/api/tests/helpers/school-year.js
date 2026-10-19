const { toLocalDateString } = require('../../src/lib/time');

/**
 * The Indian school year (April-March) containing today, plus the next one, so tests that use
 * "today" (attendance) keep working whatever the calendar date.
 */
function schoolYears(now = new Date()) {
  const today = toLocalDateString(now, 'Asia/Kolkata');
  const [year, month] = today.split('-').map(Number);
  const start = month >= 4 ? year : year - 1;
  const make = (y) => ({
    name: `${y}-${String((y + 1) % 100).padStart(2, '0')}`,
    startDate: `${y}-04-01`,
    endDate: `${y + 1}-03-31`,
  });
  return {
    today,
    current: make(start),
    next: make(start + 1),
    // A range that crosses from the current year into the next one.
    overlapping: { startDate: `${start + 1}-01-01`, endDate: `${start + 1}-06-30` },
  };
}

/** YYYY-MM-DD `days` before today in IST. */
function daysAgo(days, now = new Date()) {
  const date = new Date(`${toLocalDateString(now, 'Asia/Kolkata')}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

module.exports = { schoolYears, daysAgo };
