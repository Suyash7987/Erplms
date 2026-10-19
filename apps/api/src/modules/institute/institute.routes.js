const { Router } = require('express');
const { validate } = require('../../middleware/validate');
const { authenticate } = require('../../middleware/auth');
const { requirePermission } = require('../../middleware/rbac');
const schema = require('./institute.schema');
const controller = require('./institute.controller');

const router = Router();

router.use(authenticate());

router.get(
  '/',
  requirePermission('institute.view'),
  validate({ query: schema.emptyQuery }),
  controller.get,
);
router.patch(
  '/',
  requirePermission('institute.manage'),
  validate({ body: schema.updateInstituteBody }),
  controller.update,
);

// First-time setup wizard
router.get(
  '/setup',
  requirePermission('institute.view'),
  validate({ query: schema.emptyQuery }),
  controller.setupStatus,
);
router.post(
  '/setup/profile',
  requirePermission('institute.manage'),
  validate({ body: schema.updateInstituteBody }),
  controller.confirmProfile,
);
router.post(
  '/setup/complete',
  requirePermission('institute.manage'),
  validate({ body: schema.emptyBody }),
  controller.completeSetup,
);

module.exports = router;
