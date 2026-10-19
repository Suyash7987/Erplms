const sectionsService = require('./sections.service');

async function list(req, res) {
  res.json(await sectionsService.listSections(req.ctx, req.valid.query));
}

async function create(req, res) {
  res.status(201).json(await sectionsService.createSection(req.ctx, req.valid.body));
}

async function createGrid(req, res) {
  res.status(201).json(await sectionsService.createSectionGrid(req.ctx, req.valid.body));
}

async function update(req, res) {
  res.json(
    await sectionsService.updateSection(req.ctx, req.valid.params.sectionId, req.valid.body),
  );
}

async function remove(req, res) {
  await sectionsService.deleteSection(req.ctx, req.valid.params.sectionId);
  res.status(204).end();
}

async function getSubjects(req, res) {
  res.json(await sectionsService.getSectionSubjects(req.ctx, req.valid.params.sectionId));
}

async function setSubjects(req, res) {
  res.json(
    await sectionsService.setSectionSubjects(
      req.ctx,
      req.valid.params.sectionId,
      req.valid.body.items,
      req.ctx.meta,
    ),
  );
}

module.exports = { list, create, createGrid, update, remove, getSubjects, setSubjects };
