const levelsService = require('./levels.service');

async function list(req, res) {
  res.json(await levelsService.listLevels(req.ctx, req.valid.query));
}

async function create(req, res) {
  res.status(201).json(await levelsService.createLevel(req.ctx, req.valid.body));
}

async function createRange(req, res) {
  res.status(201).json(await levelsService.createLevelRange(req.ctx, req.valid.body));
}

async function update(req, res) {
  res.json(await levelsService.updateLevel(req.ctx, req.valid.params.levelId, req.valid.body));
}

async function remove(req, res) {
  await levelsService.deleteLevel(req.ctx, req.valid.params.levelId);
  res.status(204).end();
}

module.exports = { list, create, createRange, update, remove };
