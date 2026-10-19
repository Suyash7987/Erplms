const guardiansService = require('./guardians.service');

async function list(req, res) {
  res.json(await guardiansService.listGuardians(req.ctx, req.valid.query));
}

async function get(req, res) {
  res.json(await guardiansService.getGuardian(req.ctx, req.valid.params.guardianId));
}

async function update(req, res) {
  res.json(
    await guardiansService.updateGuardian(
      req.ctx,
      req.valid.params.guardianId,
      req.valid.body,
      req.ctx.meta,
    ),
  );
}

module.exports = { list, get, update };
