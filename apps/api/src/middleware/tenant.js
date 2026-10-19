const { AppError, ERROR_CODES } = require('../lib/errors');
const { requestMeta } = require('../lib/audit');
const sessionService = require('../modules/auth/session.service');

const sessionEnded = () =>
  AppError.unauthorized('Please sign in again', ERROR_CODES.SESSION_EXPIRED);

/**
 * Builds req.ctx for the verified token: the institute comes only from the signed JWT. Loads the
 * user and the active role's permissions from the database on every request, so disabled users,
 * removed roles and permission changes take effect immediately.
 */
async function loadTenant(req, _res, next) {
  try {
    const claims = req.auth;
    const session = await sessionService.loadSession(claims);

    if (!session || session.user.status !== 'active') throw sessionEnded();
    if (session.institute.status !== 'active') {
      throw new AppError(403, ERROR_CODES.ACCOUNT_DISABLED, 'This institute account is not active');
    }
    if (!session.permissions) throw sessionEnded();

    const changedAt = session.user.passwordChangedAt;
    if (changedAt && claims.iat < Math.floor(changedAt.getTime() / 1000)) throw sessionEnded();

    req.ctx = {
      instituteId: claims.iid,
      userId: claims.sub,
      roleId: claims.rid,
      roleCode: claims.role,
      profile: { type: claims.pt ?? null, id: claims.pid ?? null },
      permissions: new Set(session.permissions),
      enabledModules: session.institute.enabledModules ?? {},
      mustChangePassword: session.user.mustChangePassword,
      consentPending: Boolean(claims.cp),
      meta: requestMeta(req),
    };
    next();
  } catch (error) {
    next(error);
  }
}

module.exports = { loadTenant };
