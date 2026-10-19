const { rateLimit } = require('express-rate-limit');
const { env } = require('../config/env');
const { AppError, ERROR_CODES } = require('../lib/errors');

const FIFTEEN_MINUTES = 15 * 60_000;

/** In-memory limiter (per API process) that reports through the standard error shape. */
function createRateLimiter({
  windowMs,
  limit,
  keyGenerator,
  message = 'Too many requests. Please try again later.',
}) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    ...(keyGenerator ? { keyGenerator } : {}),
    handler: (_req, _res, next, options) => {
      next(
        new AppError(429, ERROR_CODES.RATE_LIMITED, message, {
          retryAfterSeconds: Math.ceil(options.windowMs / 1000),
        }),
      );
    },
  });
}

const apiRateLimiter = createRateLimiter({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.RATE_LIMIT_MAX,
});

/** Login: a strict per-account budget (IP + institute + phone) plus a looser per-IP budget. */
const loginAccountLimiter = createRateLimiter({
  windowMs: FIFTEEN_MINUTES,
  limit: env.LOGIN_RATE_LIMIT_PER_ACCOUNT,
  keyGenerator: (req) => {
    const institute = String(req.body?.instituteCode ?? '')
      .toLowerCase()
      .slice(0, 60);
    const phone = String(req.body?.phone ?? '')
      .replace(/\D/g, '')
      .slice(-10);
    return `${req.ip}|${institute}|${phone}`;
  },
  message: 'Too many sign-in attempts. Please wait a few minutes and try again.',
});

const loginIpLimiter = createRateLimiter({
  windowMs: FIFTEEN_MINUTES,
  limit: env.LOGIN_RATE_LIMIT_PER_IP,
  message: 'Too many sign-in attempts from this network. Please wait a few minutes.',
});

module.exports = { createRateLimiter, apiRateLimiter, loginAccountLimiter, loginIpLimiter };
