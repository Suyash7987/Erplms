const studentsService = require('./students.service');

// Responses that may contain temporary passwords must never be cached.
const noStore = (res) => res.set('Cache-Control', 'no-store');

async function list(req, res) {
  res.json(await studentsService.listStudents(req.ctx, req.valid.query));
}

async function get(req, res) {
  res.json(await studentsService.getStudent(req.ctx, req.valid.params.studentId));
}

async function create(req, res) {
  const result = await studentsService.createStudent(req.ctx, req.valid.body, req.ctx.meta);
  noStore(res).status(201).json(result);
}

async function update(req, res) {
  res.json(
    await studentsService.updateStudent(
      req.ctx,
      req.valid.params.studentId,
      req.valid.body,
      req.ctx.meta,
    ),
  );
}

async function changeStatus(req, res) {
  res.json(
    await studentsService.changeStatus(
      req.ctx,
      req.valid.params.studentId,
      req.valid.body,
      req.ctx.meta,
    ),
  );
}

async function setEnrollment(req, res) {
  res.json(
    await studentsService.setEnrollment(
      req.ctx,
      req.valid.params.studentId,
      req.valid.body,
      req.ctx.meta,
    ),
  );
}

async function addGuardian(req, res) {
  const result = await studentsService.addGuardian(
    req.ctx,
    req.valid.params.studentId,
    req.valid.body,
    req.ctx.meta,
  );
  noStore(res).status(201).json(result);
}

async function updateGuardian(req, res) {
  const { studentId, guardianId } = req.valid.params;
  res.json(
    await studentsService.updateGuardianLink(
      req.ctx,
      studentId,
      guardianId,
      req.valid.body,
      req.ctx.meta,
    ),
  );
}

async function removeGuardian(req, res) {
  const { studentId, guardianId } = req.valid.params;
  res.json(await studentsService.removeGuardianLink(req.ctx, studentId, guardianId, req.ctx.meta));
}

module.exports = {
  list,
  get,
  create,
  update,
  changeStatus,
  setEnrollment,
  addGuardian,
  updateGuardian,
  removeGuardian,
};
