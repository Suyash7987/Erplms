const { Router } = require('express');
const { validate } = require('../../middleware/validate');
const { authenticate } = require('../../middleware/auth');
const { requirePermission } = require('../../middleware/rbac');
const schema = require('./users.schema');
const controller = require('./users.controller');

const router = Router();

router.use(authenticate());

router.get(
  '/',
  requirePermission('users.view'),
  validate({ query: schema.listUsersQuery }),
  controller.list,
);
router.post(
  '/:userId/reset-password',
  requirePermission('users.reset_password'),
  validate({ params: schema.userParams, body: schema.emptyBody }),
  controller.resetPassword,
);
router.post(
  '/:userId/roles',
  requirePermission('roles.manage'),
  validate({ params: schema.userParams, body: schema.assignRoleBody }),
  controller.assignRole,
);
router.delete(
  '/:userId/roles/:roleId',
  requirePermission('roles.manage'),
  validate({ params: schema.userRoleParams }),
  controller.removeRole,
);

module.exports = router;
