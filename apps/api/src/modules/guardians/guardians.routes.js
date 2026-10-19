const { Router } = require('express');
const { validate } = require('../../middleware/validate');
const { authenticate } = require('../../middleware/auth');
const { requirePermission } = require('../../middleware/rbac');
const schema = require('./guardians.schema');
const controller = require('./guardians.controller');

const router = Router();

router.use(authenticate());

router.get(
  '/',
  requirePermission('guardians.view'),
  validate({ query: schema.listGuardiansQuery }),
  controller.list,
);
router.get(
  '/:guardianId',
  requirePermission('guardians.view'),
  validate({ params: schema.guardianParams, query: schema.emptyQuery }),
  controller.get,
);
router.patch(
  '/:guardianId',
  requirePermission('guardians.manage'),
  validate({ params: schema.guardianParams, body: schema.updateGuardianBody }),
  controller.update,
);

module.exports = router;
