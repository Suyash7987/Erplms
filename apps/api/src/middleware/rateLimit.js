const { rateLimit } = require('express-rate-limit');
const { env } = require('../config/env');
const { AppError, ERROR_CODES } = require('../lib/errors');

function createRateLimiter({
  windowMs,
  limit,
  message = 'Too many requests. Please try again later.',
}) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
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

module.exports = { createRateLimiter, apiRateLimiter };
