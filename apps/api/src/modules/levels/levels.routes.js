const { Router } = require('express');
const { validate } = require('../../middleware/validate');
const { authenticate } = require('../../middleware/auth');
const { requirePermission } = require('../../middleware/rbac');
const schema = require('./levels.schema');
const controller = require('./levels.controller');

const router = Router();

router.use(authenticate());

router.get(
  '/',
  requirePermission('academics.view'),
  validate({ query: schema.listLevelsQuery }),
  controller.list,
);
router.post(
  '/',
  requirePermission('academics.manage'),
  validate({ body: schema.createLevelBody }),
  controller.create,
);
router.post(
  '/range',
  requirePermission('academics.manage'),
  validate({ body: schema.createLevelRangeBody }),
  controller.createRange,
);
router.patch(
  '/:levelId',
  requirePermission('academics.manage'),
  validate({ params: schema.levelParams, body: schema.updateLevelBody }),
  controller.update,
);
router.delete(
  '/:levelId',
  requirePermission('academics.manage'),
  validate({ params: schema.levelParams }),
  controller.remove,
);

module.exports = router;
