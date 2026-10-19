const { Router } = require('express');
const { validate } = require('../../middleware/validate');
const { authenticate } = require('../../middleware/auth');
const { requirePermission } = require('../../middleware/rbac');
const schema = require('./imports.schema');
const controller = require('./imports.controller');

const router = Router();

router.use(authenticate());

const IMPORT_PERMISSION = { students: 'students.import', staff: 'staff.import' };
const checks = Object.fromEntries(
  Object.entries(IMPORT_PERMISSION).map(([type, code]) => [type, requirePermission(code)]),
);

/** The permission depends on what is being imported. */
function requireImportPermission(req, res, next) {
  return checks[req.valid.params.type](req, res, next);
}

router.get(
  '/:type/template',
  validate({ params: schema.typeParams, query: schema.emptyQuery }),
  requireImportPermission,
  controller.template,
);
router.post(
  '/:type',
  validate({ params: schema.typeParams, body: schema.importBody }),
  requireImportPermission,
  controller.run,
);

module.exports = router;
