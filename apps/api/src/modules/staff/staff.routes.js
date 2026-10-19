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

module.exports = router;
