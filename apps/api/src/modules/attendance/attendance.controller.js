const attendanceService = require('./attendance.service');

async function sections(req, res) {
  res.json(await attendanceService.listMarkableSections(req.ctx));
}

async function roster(req, res) {
  res.json(await attendanceService.getRoster(req.ctx, req.valid.query));
}

async function save(req, res) {
  res.json(await attendanceService.saveAttendance(req.ctx, req.valid.body, req.ctx.meta));
}

async function daily(req, res) {
  res.json(await attendanceService.dailyReport(req.ctx, req.valid.query));
}

async function monthly(req, res) {
  res.json(await attendanceService.monthlyReport(req.ctx, req.valid.query));
}

async function mine(req, res) {
  res.json(await attendanceService.myAttendance(req.ctx, req.valid.query));
}

module.exports = { sections, roster, save, daily, monthly, mine };
