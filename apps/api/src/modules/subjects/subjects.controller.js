const subjectsService = require('./subjects.service');

async function list(req, res) {
  res.json(await subjectsService.listSubjects(req.ctx, req.valid.query));
}

async function create(req, res) {
  res.status(201).json(await subjectsService.createSubjects(req.ctx, req.valid.body));
}

async function update(req, res) {
  res.json(
    await subjectsService.updateSubject(req.ctx, req.valid.params.subjectId, req.valid.body),
  );
}

async function remove(req, res) {
  await subjectsService.deleteSubject(req.ctx, req.valid.params.subjectId);
  res.status(204).end();
}

module.exports = { list, create, update, remove };
