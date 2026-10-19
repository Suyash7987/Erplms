const ERROR_CODES = Object.freeze({
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_JSON: 'INVALID_JSON',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  UNAUTHORIZED: 'UNAUTHORIZED',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  SESSION_REFRESHED: 'SESSION_REFRESHED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  INVALID_CURRENT_PASSWORD: 'INVALID_CURRENT_PASSWORD',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  ACCOUNT_DISABLED: 'ACCOUNT_DISABLED',
  PASSWORD_CHANGE_REQUIRED: 'PASSWORD_CHANGE_REQUIRED',
  CONSENT_REQUIRED: 'CONSENT_REQUIRED',
  FORBIDDEN: 'FORBIDDEN',
  MODULE_DISABLED: 'MODULE_DISABLED',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
});

class AppError extends Error {
  /**
   * @param {number} status HTTP status code
   * @param {string} code machine-readable code from ERROR_CODES
   * @param {string} message safe, user-facing message
   * @param {unknown} [details] extra structured context (never secrets or stack traces)
   */
  constructor(status, code, message, details) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(message, details) {
    return new AppError(400, ERROR_CODES.VALIDATION_ERROR, message, details);
  }

  static unauthorized(message = 'Authentication required', code = ERROR_CODES.UNAUTHORIZED) {
    return new AppError(401, code, message);
  }

  static forbidden(message = 'You do not have permission to perform this action') {
    return new AppError(403, ERROR_CODES.FORBIDDEN, message);
  }

  static notFound(message = 'Resource not found') {
    return new AppError(404, ERROR_CODES.NOT_FOUND, message);
  }

  static conflict(message, details) {
    return new AppError(409, ERROR_CODES.CONFLICT, message, details);
  }
}

module.exports = { AppError, ERROR_CODES };
