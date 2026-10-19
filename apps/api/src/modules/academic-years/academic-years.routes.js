const { Router } = require('express');
const { validate } = require('../../middleware/validate');
const { authenticate } = require('../../middleware/auth');
const { requirePermission } = require('../../middleware/rbac');
const schema = require('./academic-years.schema');
const controller = require('./academic-years.controller');

const router = Router();

router.use(authenticate());

router.get(
  '/',
  requirePermission('academics.view'),
  validate({ query: schema.listYearsQuery }),
  controller.list,
);
router.post(
  '/',
  requirePermission('academics.manage'),
  validate({ body: schema.createYearBody }),
  controller.create,
);
router.patch(
  '/:yearId',
  requirePermission('academics.manage'),
  validate({ params: schema.yearParams, body: schema.updateYearBody }),
  controller.update,
);
router.post(
  '/:yearId/make-current',
  requirePermission('academics.manage'),
  validate({ params: schema.yearParams, body: schema.emptyBody }),
  controller.makeCurrent,
);
router.delete(
  '/:yearId',
  requirePermission('academics.manage'),
  validate({ params: schema.yearParams }),
  controller.remove,
);

module.exports = router;
