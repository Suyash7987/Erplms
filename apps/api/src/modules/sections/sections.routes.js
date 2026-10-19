const { Router } = require('express');
const { validate } = require('../../middleware/validate');
const { authenticate } = require('../../middleware/auth');
const { requirePermission } = require('../../middleware/rbac');
const schema = require('./sections.schema');
const controller = require('./sections.controller');

const router = Router();

router.use(authenticate());

router.get(
  '/',
  requirePermission('academics.view'),
  validate({ query: schema.listSectionsQuery }),
  controller.list,
);
router.post(
  '/',
  requirePermission('academics.manage'),
  validate({ body: schema.createSectionBody }),
  controller.create,
);
router.post(
  '/grid',
  requirePermission('academics.manage'),
  validate({ body: schema.createSectionGridBody }),
  controller.createGrid,
);
router.patch(
  '/:sectionId',
  requirePermission('academics.manage'),
  validate({ params: schema.sectionParams, body: schema.updateSectionBody }),
  controller.update,
);
router.delete(
  '/:sectionId',
  requirePermission('academics.manage'),
  validate({ params: schema.sectionParams }),
  controller.remove,
);
router.get(
  '/:sectionId/subjects',
  requirePermission('academics.view'),
  validate({ params: schema.sectionParams, query: schema.emptyQuery }),
  controller.getSubjects,
);
router.put(
  '/:sectionId/subjects',
  requirePermission('academics.manage'),
  validate({ params: schema.sectionParams, body: schema.setSectionSubjectsBody }),
  controller.setSubjects,
);

module.exports = router;
