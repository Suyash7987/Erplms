const { AppError, ERROR_CODES } = require('../lib/errors');
const { PERMISSIONS, TOGGLEABLE_MODULES } = require('../config/permissions');

const MODULE_OF = new Map(PERMISSIONS.map((permission) => [permission.code, permission.module]));
const TOGGLEABLE = new Set(TOGGLEABLE_MODULES);

/** Core modules are always on; toggleable modules must be explicitly enabled for the institute. */
function isModuleEnabled(enabledModules, module) {
  return !TOGGLEABLE.has(module) || enabledModules?.[module] === true;
}

function moduleDisabled(module) {
  return new AppError(
    403,
    ERROR_CODES.MODULE_DISABLED,
    `The ${module} module is not enabled for this institute`,
    { module },
  );
}

/**
 * Central permission check. Requires every listed permission on the active role and the modules
 * they belong to to be enabled. Use after authenticate().
 *
 *   router.post('/payments', authenticate(), requirePermission('fees.collect'), ...)
 */
function requirePermission(...codes) {
  const unknown = codes.filter((code) => !MODULE_OF.has(code));
  if (!codes.length || unknown.length) {
    throw new Error(`requirePermission(): unknown permission codes ${unknown.join(', ')}`);
  }
  const modules = [...new Set(codes.map((code) => MODULE_OF.get(code)))];

  return function checkPermission(req, _res, next) {
    const { ctx } = req;
    if (!ctx) return next(AppError.unauthorized());

    const disabled = modules.find((module) => !isModuleEnabled(ctx.enabledModules, module));
    if (disabled) return next(moduleDisabled(disabled));

    if (!codes.every((code) => ctx.permissions.has(code))) return next(AppError.forbidden());
    return next();
  };
}

/** Rejects requests to a module the institute has switched off. Use after authenticate(). */
function requireModule(module) {
  return function checkModule(req, _res, next) {
    if (!req.ctx) return next(AppError.unauthorized());
    if (!isModuleEnabled(req.ctx.enabledModules, module)) return next(moduleDisabled(module));
    return next();
  };
}

module.exports = { requirePermission, requireModule, isModuleEnabled };
