const { env } = require('../config/env');
const { ACCESS_TTL_MS } = require('./tokens');

const ACCESS_COOKIE = 'erp_at';
const REFRESH_COOKIE = 'erp_rt';

// The refresh cookie is only sent to /api/v1/auth (refresh, logout, switch-profile, change-password).
const ACCESS_PATH = '/api/v1';
const REFRESH_PATH = '/api/v1/auth';

const base = () => ({ httpOnly: true, secure: env.COOKIE_SECURE, sameSite: 'strict' });

function setAuthCookies(res, { accessToken, refreshToken, refreshExpiresAt }) {
  res.cookie(ACCESS_COOKIE, accessToken, { ...base(), path: ACCESS_PATH, maxAge: ACCESS_TTL_MS });
  res.cookie(REFRESH_COOKIE, refreshToken, {
    ...base(),
    path: REFRESH_PATH,
    expires: refreshExpiresAt,
  });
}

function setAccessCookie(res, accessToken) {
  res.cookie(ACCESS_COOKIE, accessToken, { ...base(), path: ACCESS_PATH, maxAge: ACCESS_TTL_MS });
}

function clearAuthCookies(res) {
  res.clearCookie(ACCESS_COOKIE, { ...base(), path: ACCESS_PATH });
  res.clearCookie(REFRESH_COOKIE, { ...base(), path: REFRESH_PATH });
}

module.exports = {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  setAuthCookies,
  setAccessCookie,
  clearAuthCookies,
};
