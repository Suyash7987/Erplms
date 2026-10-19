const { z } = require('zod');
const { phoneSchema } = require('../../lib/validation');
const { parseFlexibleDate } = require('../../lib/dates');

const emailSchema = z.string().email().max(254);

/**
 * Reads typed values out of one CSV record, collecting a row-level error per bad cell instead of
 * stopping at the first problem, so the preview can show everything that needs fixing.
 */
function cellReader(values, errors) {
  const fail = (column, message) => {
    errors.push({ column, message });
    return null;
  };
  const raw = (column) => values[column] ?? '';

  return {
    raw,
    text(column, { required = false, max = 200 } = {}) {
      const value = raw(column);
      if (!value) return required ? fail(column, 'Required') : null;
      if (value.length > max) return fail(column, `At most ${max} characters`);
      return value;
    },
    phone(column, { required = false } = {}) {
      const value = raw(column);
      if (!value) return required ? fail(column, 'Required') : null;
      const result = phoneSchema.safeParse(value);
      return result.success ? result.data : fail(column, 'Not a valid 10-digit mobile number');
    },
    email(column) {
      const value = raw(column);
      if (!value) return null;
      return emailSchema.safeParse(value).success
        ? value
        : fail(column, 'Not a valid email address');
    },
    date(column) {
      const value = raw(column);
      if (!value) return null;
      return parseFlexibleDate(value) ?? fail(column, 'Use DD-MM-YYYY or YYYY-MM-DD');
    },
    integer(column, { min, max }) {
      const value = raw(column);
      if (!value) return null;
      const number = Number(value);
      if (!Number.isInteger(number) || number < min || number > max) {
        return fail(column, `Use a whole number from ${min} to ${max}`);
      }
      return number;
    },
    /** Maps free text through `aliases` ({ input: canonical }); empty uses `fallback`. */
    choice(column, aliases, fallback = null) {
      const value = raw(column).toLowerCase();
      if (!value) return fallback;
      return (
        aliases[value] ??
        fail(column, `Use one of: ${[...new Set(Object.values(aliases))].join(', ')}`)
      );
    },
    fail,
  };
}

const GENDERS = {
  m: 'male',
  male: 'male',
  boy: 'male',
  f: 'female',
  female: 'female',
  girl: 'female',
  o: 'other',
  other: 'other',
};

const RELATIONS = {
  father: 'father',
  dad: 'father',
  mother: 'mother',
  mom: 'mother',
  guardian: 'guardian',
  grandparent: 'grandparent',
  grandfather: 'grandparent',
  grandmother: 'grandparent',
  sibling: 'sibling',
  brother: 'sibling',
  sister: 'sibling',
  other: 'other',
};

module.exports = { cellReader, GENDERS, RELATIONS };
