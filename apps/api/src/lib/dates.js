const { z } = require('zod');

/**
 * Calendar dates (academic year bounds, attendance days, due dates) travel as "YYYY-MM-DD" IST
 * calendar days and are stored in DATE columns, which Prisma represents as UTC midnight.
 */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function parseDateOnly(value) {
  return new Date(`${value}T00:00:00.000Z`);
}

const dateOnlySchema = z
  .string()
  .regex(DATE_ONLY, 'Use the format YYYY-MM-DD')
  .refine((value) => {
    const date = parseDateOnly(value);
    return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
  }, 'Not a real calendar date')
  .transform(parseDateOnly);

function formatDateOnly(date) {
  return date ? date.toISOString().slice(0, 10) : null;
}

const DAY_MS = 86_400_000;

function daysBetween(start, end) {
  return Math.round((end.getTime() - start.getTime()) / DAY_MS);
}

/**
 * Dates typed in spreadsheets: YYYY-MM-DD, or the Indian day-first DD-MM-YYYY / DD/MM/YYYY /
 * DD.MM.YYYY. Returns a Date at UTC midnight, or null when the value is not a real date.
 */
function parseFlexibleDate(value) {
  const text = String(value ?? '').trim();
  let year;
  let month;
  let day;
  let match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) {
    [, year, month, day] = match;
  } else {
    match = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
    if (!match) return null;
    [, day, month, year] = match;
  }
  const iso = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  const date = parseDateOnly(iso);
  return Number.isNaN(date.getTime()) || !date.toISOString().startsWith(iso) ? null : date;
}

module.exports = {
  dateOnlySchema,
  formatDateOnly,
  parseDateOnly,
  parseFlexibleDate,
  daysBetween,
};
