const { createHash, randomUUID } = require('node:crypto');
const jwt = require('jsonwebtoken');
const { env } = require('../config/env');
const { AppError, ERROR_CODES } = require('./errors');

const ISSUER = 'erplms-api';
const ACCESS_AUDIENCE = 'erplms-access';
const REFRESH_AUDIENCE = 'erplms-refresh';
const ALGORITHM = 'HS256';

const ACCESS_TTL_MS = env.ACCESS_TOKEN_TTL_MINUTES * 60_000;
const REFRESH_TTL_MS = env.REFRESH_TOKEN_TTL_DAYS * 86_400_000;

/**
 * Access token claims: sub = user id, iid = institute id, rid/role = active role, pt/pid = active
 * profile (type and id, e.g. "student" + the child a parent is viewing), cp = parental consent pending.
 */
function signAccessToken({ userId, instituteId, profile, consentPending }) {
  return jwt.sign(
    {
      iid: instituteId,
      rid: profile.roleId,
      role: profile.roleCode,
      pt: profile.type,
      pid: profile.id,
      cp: Boolean(consentPending),
    },
    env.JWT_ACCESS_SECRET,
    {
      algorithm: ALGORITHM,
      subject: userId,
      issuer: ISSUER,
      audience: ACCESS_AUDIENCE,
      expiresIn: Math.floor(ACCESS_TTL_MS / 1000),
      jwtid: randomUUID(),
    },
  );
}

/**
 * Refresh tokens are JWTs too (so the institute is known before any lookup), but they are also
 * stored hashed in refresh_tokens and are single-use: every refresh rotates them.
 */
function signRefreshToken({ userId, instituteId, familyId, profileKey }) {
  const expiresAt = new Date(Date.now() + REFRESH_TTL_MS);
  const token = jwt.sign(
    { iid: instituteId, fam: familyId, pk: profileKey },
    env.JWT_REFRESH_SECRET,
    {
      algorithm: ALGORITHM,
      subject: userId,
      issuer: ISSUER,
      audience: REFRESH_AUDIENCE,
      expiresIn: Math.floor(REFRESH_TTL_MS / 1000),
      jwtid: randomUUID(),
    },
  );
  return { token, expiresAt };
}

function verify(token, secret, audience) {
  try {
    return jwt.verify(token, secret, { algorithms: [ALGORITHM], issuer: ISSUER, audience });
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw AppError.unauthorized('Session expired', ERROR_CODES.TOKEN_EXPIRED);
    }
    throw AppError.unauthorized();
  }
}

function verifyAccessToken(token) {
  return verify(token, env.JWT_ACCESS_SECRET, ACCESS_AUDIENCE);
}

function verifyRefreshToken(token) {
  try {
    return verify(token, env.JWT_REFRESH_SECRET, REFRESH_AUDIENCE);
  } catch {
    throw AppError.unauthorized('Please sign in again', ERROR_CODES.SESSION_EXPIRED);
  }
}

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  hashToken,
  ACCESS_TTL_MS,
};
