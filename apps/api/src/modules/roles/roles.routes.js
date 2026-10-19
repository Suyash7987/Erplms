const { Router } = require('express');
const { validate } = require('../../middleware/validate');
const { authenticate } = require('../../middleware/auth');
const { requirePermission } = require('../../middleware/rbac');
const schema = require('./roles.schema');
const controller = require('./roles.controller');

const router = Router();

router.use(authenticate());

router.get(
  '/permissions',
  requirePermission('roles.view'),
  validate({ query: schema.emptyQuery }),
  controller.listPermissions,
);
router.get(
  '/',
  requirePermission('roles.view'),
  validate({ query: schema.listRolesQuery }),
  controller.list,
);
router.post(
  '/',
  requirePermission('roles.manage'),
  validate({ body: schema.createRoleBody }),
  controller.create,
);
router.put(
  '/:roleId/permissions',
  requirePermission('roles.manage'),
  validate({ params: schema.roleParams, body: schema.updateRolePermissionsBody }),
  controller.updatePermissions,
);

module.exports = router;
