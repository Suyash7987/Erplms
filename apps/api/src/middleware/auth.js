const { AppError, ERROR_CODES } = require('../lib/errors');
const { verifyAccessToken } = require('../lib/tokens');
const { ACCESS_COOKIE } = require('../lib/cookies');
const { loadTenant } = require('./tenant');

/** Verifies the access-token cookie and puts its claims on req.auth. */
function verifyToken(req, _res, next) {
  const token = req.cookies?.[ACCESS_COOKIE];
  if (!token) return next(AppError.unauthorized());
  try {
    req.auth = verifyAccessToken(token);
    return next();
  } catch (error) {
    return next(error);
  }
}

/** Blocks everything except the auth flow until the password is changed and consent is given. */
function requireCompletedOnboarding(req, _res, next) {
  if (req.ctx.mustChangePassword) {
    return next(
      new AppError(403, ERROR_CODES.PASSWORD_CHANGE_REQUIRED, 'Please change your password first'),
    );
  }
  if (req.ctx.consentPending) {
    return next(
      new AppError(403, ERROR_CODES.CONSENT_REQUIRED, 'Please review and accept the consent first'),
    );
  }
  return next();
}

/**
 * Middleware chain for authenticated routes: verify the JWT, load the tenant session (user, active
 * role permissions, enabled modules) and, unless `allowPending`, require completed onboarding.
 */
function authenticate({ allowPending = false } = {}) {
  return allowPending
    ? [verifyToken, loadTenant]
    : [verifyToken, loadTenant, requireCompletedOnboarding];
}

module.exports = { authenticate };
