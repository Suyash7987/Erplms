const { Router } = require('express');
const { validate } = require('../../middleware/validate');
const { authenticate } = require('../../middleware/auth');
const { requirePermission } = require('../../middleware/rbac');
const schema = require('./staff.schema');
const controller = require('./staff.controller');

const router = Router();

router.use(authenticate());

router.get(
  '/',
  requirePermission('staff.view'),
  validate({ query: schema.listStaffQuery }),
  controller.list,
);
router.post(
  '/',
  requirePermission('staff.create'),
  validate({ body: schema.createStaffBody }),
  controller.create,
);
router.get(
  '/:staffId',
  requirePermission('staff.view'),
  validate({ params: schema.staffParams, query: schema.emptyQuery }),
  controller.get,
);
router.patch(
  '/:staffId',
  requirePermission('staff.update'),
  validate({ params: schema.staffParams, body: schema.updateStaffBody }),
  controller.update,
);

module.exports = router;
