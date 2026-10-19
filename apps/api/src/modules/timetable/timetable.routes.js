const { Router } = require('express');
const { validate } = require('../../middleware/validate');
const { authenticate } = require('../../middleware/auth');
const { requirePermission } = require('../../middleware/rbac');
const schema = require('./timetable.schema');
const controller = require('./timetable.controller');

const router = Router();

router.use(authenticate());

router.get(
  '/periods',
  requirePermission('timetable.view'),
  validate({ query: schema.yearQuery }),
  controller.periods,
);
router.put(
  '/periods',
  requirePermission('timetable.manage'),
  validate({ body: schema.replacePeriodsBody }),
  controller.replacePeriods,
);
router.get(
  '/me',
  requirePermission('timetable.view'),
  validate({ query: schema.emptyQuery }),
  controller.mine,
);
router.get(
  '/sections/:sectionId',
  requirePermission('timetable.view'),
  validate({ params: schema.sectionParams, query: schema.emptyQuery }),
  controller.section,
);
router.get(
  '/teachers/:staffId',
  requirePermission('timetable.view'),
  validate({ params: schema.staffParams, query: schema.emptyQuery }),
  controller.teacher,
);
router.get(
  '/availability',
  requirePermission('timetable.manage'),
  validate({ query: schema.availabilityQuery }),
  controller.availability,
);
router.put(
  '/slots',
  requirePermission('timetable.manage'),
  validate({ body: schema.setSlotBody }),
  controller.setSlot,
);
router.delete(
  '/slots/:slotId',
  requirePermission('timetable.manage'),
  validate({ params: schema.slotParams }),
  controller.clearSlot,
);

module.exports = router;
