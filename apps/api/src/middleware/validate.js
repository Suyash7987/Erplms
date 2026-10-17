const { AppError } = require('../lib/errors');
const { formatZodIssues } = require('./error');

const LOCATIONS = ['params', 'query', 'body'];

/**
 * Validates request params, query and body with Zod schemas.
 * Parsed (coerced, stripped) values are exposed on `req.valid.{params,query,body}`;
 * `req.body` is also replaced. Express 5 makes `req.query` read-only, so always
 * read query values from `req.valid.query`.
 *
 * @param {{ params?: import('zod').ZodTypeAny, query?: import('zod').ZodTypeAny, body?: import('zod').ZodTypeAny }} schemas
 */
function validate(schemas) {
  const unknownKeys = Object.keys(schemas).filter((key) => !LOCATIONS.includes(key));
  if (unknownKeys.length) {
    throw new Error(`validate(): unknown schema keys ${unknownKeys.join(', ')}`);
  }

  return function validateRequest(req, _res, next) {
    const valid = {};
    const issues = [];

    for (const location of LOCATIONS) {
      const schema = schemas[location];
      if (!schema) continue;

      const result = schema.safeParse(req[location] ?? {});
      if (result.success) {
        valid[location] = result.data;
      } else {
        issues.push(...formatZodIssues(result.error.issues, location));
      }
    }

    if (issues.length) {
      return next(AppError.badRequest('Request validation failed', issues));
    }

    req.valid = valid;
    if (valid.body !== undefined) req.body = valid.body;
    return next();
  };
}

module.exports = { validate };
