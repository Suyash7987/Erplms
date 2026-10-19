const { randomInt } = require('node:crypto');
const bcrypt = require('bcrypt');
const { env } = require('../config/env');

// Excludes look-alike characters (0/O, 1/l/I) because temporary passwords are read out or written down.
const LOWER = 'abcdefghjkmnpqrstuvwxyz';
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGITS = '23456789';
const SYMBOLS = '@#$%&*';

function hashPassword(plain) {
  return bcrypt.hash(plain, env.BCRYPT_ROUNDS);
}

function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

function pick(alphabet) {
  return alphabet[randomInt(alphabet.length)];
}

/** A random temporary password with at least one lowercase, uppercase, digit and symbol. */
function generateTemporaryPassword(length = 10) {
  const all = LOWER + UPPER + DIGITS + SYMBOLS;
  const chars = [pick(LOWER), pick(UPPER), pick(DIGITS), pick(SYMBOLS)];
  while (chars.length < length) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

module.exports = { hashPassword, verifyPassword, generateTemporaryPassword };
