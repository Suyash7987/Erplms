const timetableService = require('./timetable.service');

async function periods(req, res) {
  res.json(await timetableService.listPeriods(req.ctx, req.valid.query));
}

async function replacePeriods(req, res) {
  res.json(await timetableService.replacePeriods(req.ctx, req.valid.body, req.ctx.meta));
}

async function section(req, res) {
  res.json(await timetableService.getSectionTimetable(req.ctx, req.valid.params.sectionId));
}

async function teacher(req, res) {
  res.json(await timetableService.getTeacherTimetable(req.ctx, req.valid.params.staffId));
}

async function mine(req, res) {
  res.json(await timetableService.getMyTimetable(req.ctx));
}

async function availability(req, res) {
  res.json(await timetableService.getAvailability(req.ctx, req.valid.query));
}

async function setSlot(req, res) {
  res.json(await timetableService.setSlot(req.ctx, req.valid.body, req.ctx.meta));
}

async function clearSlot(req, res) {
  await timetableService.clearSlot(req.ctx, req.valid.params.slotId, req.ctx.meta);
  res.status(204).end();
}

module.exports = { periods, replacePeriods, section, teacher, mine, availability, setSlot, clearSlot };
