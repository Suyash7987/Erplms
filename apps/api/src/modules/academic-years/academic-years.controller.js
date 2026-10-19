const yearsService = require('./academic-years.service');

async function list(req, res) {
  res.json(await yearsService.listYears(req.ctx, req.valid.query));
}

async function create(req, res) {
  res.status(201).json(await yearsService.createYear(req.ctx, req.valid.body, req.ctx.meta));
}

async function update(req, res) {
  res.json(
    await yearsService.updateYear(req.ctx, req.valid.params.yearId, req.valid.body, req.ctx.meta),
  );
}

async function makeCurrent(req, res) {
  res.json(await yearsService.makeCurrent(req.ctx, req.valid.params.yearId, req.ctx.meta));
}

async function remove(req, res) {
  await yearsService.deleteYear(req.ctx, req.valid.params.yearId, req.ctx.meta);
  res.status(204).end();
}

module.exports = { list, create, update, makeCurrent, remove };
