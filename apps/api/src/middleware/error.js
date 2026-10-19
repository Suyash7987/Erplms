const { ZodError } = require('zod');
const { env } = require('../config/env');
const { AppError, ERROR_CODES } = require('../lib/errors');
const { logger } = require('../lib/logger');

function formatZodIssues(issues, location) {
  return issues.map((issue) => ({
    location,
    path: issue.path.join('.'),
    message: issue.message,
    code: issue.code,
  }));
}

function fromPrismaError(error) {
  switch (error.code) {
    case 'P2002':
      return AppError.conflict('A record with these values already exists', {
        fields: error.meta?.target,
      });
    case 'P2003':
      return AppError.conflict('This record is linked to other records', {
        field: error.meta?.field_name,
      });
    case 'P2025':
      return AppError.notFound();
    default:
      return null;
  }
}

/** Converts any thrown value into an AppError with a safe, user-facing message. */
function normalizeError(error) {
  if (error instanceof AppError) return error;

  if (error instanceof ZodError) {
    return AppError.badRequest('Request validation failed', formatZodIssues(error.issues));
  }

  if (error?.type === 'entity.parse.failed') {
    return new AppError(400, ERROR_CODES.INVALID_JSON, 'Request body is not valid JSON');
  }
  if (error?.type === 'entity.too.large') {
    return new AppError(413, ERROR_CODES.PAYLOAD_TOO_LARGE, 'Request body is too large');
  }

  if (error?.name === 'PrismaClientKnownRequestError') {
    const mapped = fromPrismaError(error);
    if (mapped) return mapped;
  }

  // A Row Level Security rejection means a write targeted another institute (or had no tenant).
  if (/row-level security/.test(error?.message ?? '')) {
    return AppError.forbidden();
  }

  return new AppError(500, ERROR_CODES.INTERNAL_ERROR, 'Something went wrong. Please try again.');
}

function notFoundHandler(req, _res, next) {
  next(new AppError(404, ERROR_CODES.NOT_FOUND, `Route ${req.method} ${req.path} not found`));
}

// Express identifies error middleware by its four-argument signature.
function errorHandler(error, req, res, _next) {
  const appError = normalizeError(error);
  const log = req.log ?? logger;

  if (appError.status >= 500) {
    log.error({ err: error }, 'unhandled error');
  } else {
    log.warn({ code: appError.code, status: appError.status }, appError.message);
  }

  const body = {
    error: {
      code: appError.code,
      message: appError.message,
      details: appError.details ?? null,
      requestId: req.id,
    },
  };

  if (env.isDevelopment && appError.status >= 500) {
    body.error.stack = error?.stack;
  }

  res.status(appError.status).json(body);
}

module.exports = { errorHandler, notFoundHandler, normalizeError, formatZodIssues };
