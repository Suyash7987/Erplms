const { env } = require('../config/env');

/**
 * All timestamps are stored and returned as UTC ISO-8601 strings.
 * Calendar concepts (attendance date, "today", due dates) are derived in the
 * institute timezone, which defaults to IST (Asia/Kolkata, UTC+05:30).
 */

function nowIso() {
  return new Date().toISOString();
}

/** Returns the calendar date (YYYY-MM-DD) of `date` in the given timezone. */
function toLocalDateString(date = new Date(), timeZone = env.APP_TIMEZONE) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Returns an ISO-8601 string with the explicit offset of the given timezone, e.g. 2026-01-02T00:30:00+05:30. */
function toZonedIso(date = new Date(), timeZone = env.APP_TIMEZONE) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'longOffset',
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  const offset = parts.timeZoneName === 'GMT' ? '+00:00' : parts.timeZoneName.replace('GMT', '');
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${offset}`;
}

module.exports = { nowIso, toLocalDateString, toZonedIso };
