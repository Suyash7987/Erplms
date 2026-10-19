const staffService = require('./staff.service');

async function list(req, res) {
  res.json(await staffService.listStaff(req.ctx, req.valid.query));
}

module.exports = { list };
