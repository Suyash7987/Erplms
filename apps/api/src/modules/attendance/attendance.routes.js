const { Router } = require('express');
const { validate } = require('../../middleware/validate');
const { authenticate } = require('../../middleware/auth');
const { requirePermission } = require('../../middleware/rbac');
const schema = require('./attendance.schema');
const controller = require('./attendance.controller');

const router = Router();

router.use(authenticate());

router.get(
  '/sections',
  requirePermission('attendance.mark'),
  validate({ query: schema.emptyQuery }),
  controller.sections,
);
router.get(
  '/roster',
  requirePermission('attendance.view'),
  validate({ query: schema.rosterQuery }),
  controller.roster,
);
router.put(
  '/roster',
  requirePermission('attendance.mark'),
  validate({ body: schema.saveBody }),
  controller.save,
);
router.get(
  '/reports/daily',
  requirePermission('attendance.report'),
  validate({ query: schema.dailyQuery }),
  controller.daily,
);
router.get(
  '/reports/monthly',
  requirePermission('attendance.report'),
  validate({ query: schema.monthlyQuery }),
  controller.monthly,
);
router.get(
  '/me',
  requirePermission('attendance.view_own'),
  validate({ query: schema.myQuery }),
  controller.mine,
);

module.exports = router;
