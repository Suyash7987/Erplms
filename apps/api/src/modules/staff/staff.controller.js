const staffService = require('./staff.service');

async function list(req, res) {
  res.json(await staffService.listStaff(req.ctx, req.valid.query));
}

async function get(req, res) {
  res.json(await staffService.getStaff(req.ctx, req.valid.params.staffId));
}

async function create(req, res) {
  const result = await staffService.createStaff(req.ctx, req.valid.body, req.ctx.meta);
  res.set('Cache-Control', 'no-store').status(201).json(result);
}

async function update(req, res) {
  res.json(
    await staffService.updateStaff(req.ctx, req.valid.params.staffId, req.valid.body, req.ctx.meta),
  );
}

module.exports = { list, get, create, update };
