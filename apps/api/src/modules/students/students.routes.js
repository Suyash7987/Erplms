const { Router } = require('express');
const { validate } = require('../../middleware/validate');
const { authenticate } = require('../../middleware/auth');
const { requirePermission } = require('../../middleware/rbac');
const schema = require('./students.schema');
const controller = require('./students.controller');

const router = Router();

router.use(authenticate());

router.get(
  '/',
  requirePermission('students.view'),
  validate({ query: schema.listStudentsQuery }),
  controller.list,
);
router.post(
  '/',
  requirePermission('students.create'),
  validate({ body: schema.createStudentBody }),
  controller.create,
);
router.get(
  '/:studentId',
  requirePermission('students.view'),
  validate({ params: schema.studentParams, query: schema.emptyQuery }),
  controller.get,
);
router.patch(
  '/:studentId',
  requirePermission('students.update'),
  validate({ params: schema.studentParams, body: schema.updateStudentBody }),
  controller.update,
);
router.post(
  '/:studentId/status',
  requirePermission('students.archive'),
  validate({ params: schema.studentParams, body: schema.statusBody }),
  controller.changeStatus,
);
router.put(
  '/:studentId/enrollment',
  requirePermission('students.update'),
  validate({ params: schema.studentParams, body: schema.enrollmentBody }),
  controller.setEnrollment,
);
router.post(
  '/:studentId/guardians',
  requirePermission('students.update', 'guardians.manage'),
  validate({ params: schema.studentParams, body: schema.guardianInput }),
  controller.addGuardian,
);
router.patch(
  '/:studentId/guardians/:guardianId',
  requirePermission('students.update', 'guardians.manage'),
  validate({ params: schema.studentGuardianParams, body: schema.guardianLinkBody }),
  controller.updateGuardian,
);
router.delete(
  '/:studentId/guardians/:guardianId',
  requirePermission('students.update', 'guardians.manage'),
  validate({ params: schema.studentGuardianParams }),
  controller.removeGuardian,
);

module.exports = router;
