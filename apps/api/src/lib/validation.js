const { z } = require('zod');

/**
 * Indian mobile numbers as stored in users.phone: 10 digits. Accepts spaces, dashes, a leading 0
 * or a +91 / 91 country code and normalises them away.
 */
const phoneSchema = z
  .string()
  .trim()
  .transform((value) => {
    const digits = value.replace(/\D/g, '');
    if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
    if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
    return digits;
  })
  .pipe(z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number'));

/** Password rules for every password a user chooses (temporary passwords are generated). */
const strongPasswordSchema = z
  .string()
  .min(8, 'Use at least 8 characters')
  .max(64, 'Use at most 64 characters')
  .regex(/[a-z]/, 'Add a lowercase letter')
  .regex(/[A-Z]/, 'Add an uppercase letter')
  .regex(/\d/, 'Add a number')
  .regex(/[^A-Za-z0-9]/, 'Add a symbol such as @ # $ %');

const instituteCodeSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2, 'Enter your institute code')
  .max(60)
  .regex(/^[a-z0-9][a-z0-9-]*$/, 'Use letters, numbers and dashes only');

module.exports = { phoneSchema, strongPasswordSchema, instituteCodeSchema };
