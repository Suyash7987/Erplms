const { Router } = require('express');
const { validate } = require('../../middleware/validate');
const { authenticate } = require('../../middleware/auth');
const { requirePermission } = require('../../middleware/rbac');
const schema = require('./subjects.schema');
const controller = require('./subjects.controller');

const router = Router();

router.use(authenticate());

router.get(
  '/',
  requirePermission('academics.view'),
  validate({ query: schema.listSubjectsQuery }),
  controller.list,
);
router.post(
  '/',
  requirePermission('academics.manage'),
  validate({ body: schema.createSubjectsBody }),
  controller.create,
);
router.patch(
  '/:subjectId',
  requirePermission('academics.manage'),
  validate({ params: schema.subjectParams, body: schema.updateSubjectBody }),
  controller.update,
);
router.delete(
  '/:subjectId',
  requirePermission('academics.manage'),
  validate({ params: schema.subjectParams }),
  controller.remove,
);

module.exports = router;
