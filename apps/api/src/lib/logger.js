const pino = require('pino');
const { env } = require('../config/env');

const logger = pino({
  level: env.LOG_LEVEL,
  base: { service: process.env.SERVICE_NAME || 'api', env: env.NODE_ENV },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      '*.password',
      '*.otp',
      '*.token',
      '*.refreshToken',
    ],
    censor: '[REDACTED]',
  },
  transport: env.isDevelopment
    ? {
        target: 'pino-pretty',
        options: { translateTime: 'SYS:standard', ignore: 'pid,hostname,service,env' },
      }
    : undefined,
});

module.exports = { logger };
