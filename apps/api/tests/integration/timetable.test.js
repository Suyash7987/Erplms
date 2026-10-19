const { createApp } = require('../../src/app');
const { prisma, withTenant } = require('../../src/lib/prisma');
const { CONSENT_VERSION } = require('../../src/config/consent');
const { createAuthTenant, signIn } = require('../helpers/auth-fixtures');

const app = createApp();
let t;
let admin;
let teacher;
let staff;
let periods;
let subjects;
let sectionB;

const staffIdOf = (userKey) =>
  withTenant(t.instituteId, async (tx) => (await tx.staff.findFirst({ where: { userId: t.users[userKey].id } })).id);

const setSlot = (body) => admin.put('/api/v1/timetable/slots').send(body);
const period = (name) => periods.find((p) => p.name === name);

beforeAll(async () => {
  t = await createAuthTenant('Timetable');
  admin = (await signIn(app, t, 'admin')).agent;
  teacher = (await signIn(app, t, 'teacher')).agent;
  staff = { teacher: await staffIdOf('teacher'), teacherParent: await staffIdOf('teacherParent') };

  const created = await admin.post('/api/v1/subjects').send({
    subjects: [
      { name: 'English', code: 'ENG' },
      { name: 'Mathematics', code: 'MATH' },
      { name: 'Science', code: 'SCI' },
    ],
  });
  subjects = Object.fromEntries(created.body.data.map((s) => [s.code, s.id]));

  const level = (await admin.get('/api/v1/levels')).body.data[0];
  sectionB = (await admin.post('/api/v1/sections').send({ academicYearId: t.year.id, levelId: level.id, name: 'B' })).body;

  await admin.put(`/api/v1/sections/${t.sectionId}/subjects`).send({
    items: [
      { subjectId: subjects.ENG, teacherStaffId: staff.teacher },
      { subjectId: subjects.MATH, teacherStaffId: staff.teacherParent },
    ],
  });
  await admin.put(`/api/v1/sections/${sectionB.id}/subjects`).send({
    items: [{ subjectId: subjects.ENG, teacherStaffId: staff.teacher }],
  });
});

afterAll(() => prisma.$disconnect());

describe('bell schedule', () => {
  test('periods are saved and numbered by start time', async () => {
    const res = await admin.put('/api/v1/timetable/periods').send({
      periods: [
        { name: 'Period 2', startTime: '08:40', endTime: '09:20' },
        { name: 'Period 1', startTime: '08:00', endTime: '08:40' },
        { name: 'Break', startTime: '09:20', endTime: '09:35', isBreak: true },
        { name: 'Period 3', startTime: '09:35', endTime: '10:15' },
      ],
    });

    expect(res.status).toBe(200);
    expect(res.body.data.map((p) => [p.periodNo, p.name])).toEqual([
      [1, 'Period 1'],
      [2, 'Period 2'],
      [3, 'Break'],
      [4, 'Period 3'],
    ]);
    expect(res.body.workingDays).toEqual([1, 2, 3, 4, 5, 6]);
    periods = res.body.data;
  });

  test('overlapping or backwards periods are rejected', async () => {
    const overlap = await admin.put('/api/v1/timetable/periods').send({
      periods: [
        { name: 'A', startTime: '08:00', endTime: '08:45' },
        { name: 'B', startTime: '08:40', endTime: '09:20' },
      ],
    });
    const backwards = await admin
      .put('/api/v1/timetable/periods')
      .send({ periods: [{ name: 'A', startTime: '09:00', endTime: '08:00' }] });
    const badTime = await admin
      .put('/api/v1/timetable/periods')
      .send({ periods: [{ name: 'A', startTime: '8:00', endTime: '09:00' }] });

    expect(overlap.status).toBe(400);
    expect(overlap.body.error.message).toMatch(/"B" overlaps with "A"/);
    expect(backwards.status).toBe(400);
    expect(badTime.status).toBe(400);
  });

  test('teachers can read the schedule but not change it', async () => {
    expect((await teacher.get('/api/v1/timetable/periods')).body.data).toHaveLength(4);
    expect((await teacher.put('/api/v1/timetable/periods').send({ periods: [] })).status).toBe(403);
  });
});

describe('timetable slots and clash detection', () => {
  test("a slot uses the subject's assigned teacher by default", async () => {
    const res = await setSlot({ sectionId: t.sectionId, dayOfWeek: 1, periodId: period('Period 1').id, subjectId: subjects.ENG });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      dayOfWeek: 1,
      startTime: '08:00',
      endTime: '08:40',
      subject: { code: 'ENG' },
      teacher: { id: staff.teacher },
    });
  });

  test('the same teacher cannot be in two sections at once', async () => {
    const res = await setSlot({ sectionId: sectionB.id, dayOfWeek: 1, periodId: period('Period 1').id, subjectId: subjects.ENG });

    expect(res.status).toBe(409);
    expect(res.body.error.message).toBe('Timetable teacher already teaches Class 3 - A in Period 1');
    expect(res.body.error.details).toMatchObject({ type: 'teacher', section: 'Class 3 - A', subject: 'English' });
  });

  test('the same room cannot be used by two sections at once (case-insensitive)', async () => {
    await setSlot({ sectionId: t.sectionId, dayOfWeek: 1, periodId: period('Period 2').id, subjectId: subjects.MATH, room: 'Lab-1' });

    const clash = await setSlot({
      sectionId: sectionB.id,
      dayOfWeek: 1,
      periodId: period('Period 2').id,
      subjectId: subjects.ENG,
      room: 'lab-1',
    });
    const otherRoom = await setSlot({
      sectionId: sectionB.id,
      dayOfWeek: 1,
      periodId: period('Period 2').id,
      subjectId: subjects.ENG,
      room: 'Lab-2',
    });

    expect(clash.status).toBe(409);
    expect(clash.body.error.details.type).toBe('room');
    expect(otherRoom.status).toBe(200);
  });

  test('changing a cell replaces it; no clash with itself', async () => {
    const res = await setSlot({ sectionId: t.sectionId, dayOfWeek: 1, periodId: period('Period 1').id, subjectId: subjects.MATH });

    expect(res.status).toBe(200);
    expect(res.body.teacher.id).toBe(staff.teacherParent);
    const week = await admin.get(`/api/v1/timetable/sections/${t.sectionId}`);
    expect(week.body.slots.filter((s) => s.dayOfWeek === 1 && s.periodId === period('Period 1').id)).toHaveLength(1);
  });

  test('breaks, non-working days, unmapped subjects and outside teachers are rejected', async () => {
    const base = { sectionId: t.sectionId, dayOfWeek: 2, periodId: period('Period 3').id, subjectId: subjects.ENG };
    const outsider = await createAuthTenant('TimetableOther');
    const outsiderStaff = await withTenant(outsider.instituteId, async (tx) =>
      (await tx.staff.findFirst({ where: { userId: outsider.users.teacher.id } })).id,
    );

    expect((await setSlot({ ...base, periodId: period('Break').id })).status).toBe(400);
    expect((await setSlot({ ...base, dayOfWeek: 7 })).status).toBe(400);
    expect((await setSlot({ ...base, subjectId: subjects.SCI })).body.error.message).toMatch(/Add this subject/);
    expect((await setSlot({ ...base, teacherStaffId: outsiderStaff })).status).toBe(400);
  });

  test('two editors booking the same teacher at once: one wins, the other gets a clash', async () => {
    const results = await Promise.all([
      setSlot({ sectionId: t.sectionId, dayOfWeek: 3, periodId: period('Period 1').id, subjectId: subjects.ENG }),
      setSlot({ sectionId: sectionB.id, dayOfWeek: 3, periodId: period('Period 1').id, subjectId: subjects.ENG }),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  });

  test('availability lists busy teachers and rooms for a period', async () => {
    const res = await admin.get(`/api/v1/timetable/availability?dayOfWeek=1&periodId=${period('Period 2').id}`);

    expect(res.body.rooms.map((r) => r.room).sort()).toEqual(['Lab-1', 'Lab-2']);
    expect(res.body.teachers.map((r) => r.staffId).sort()).toEqual([staff.teacher, staff.teacherParent].sort());
  });

  test('changing period times updates the timetable; periods in use cannot be removed', async () => {
    const updated = periods.map((p) =>
      p.name === 'Period 1' ? { id: p.id, name: p.name, startTime: '07:50', endTime: '08:30', isBreak: false } : { id: p.id, name: p.name, startTime: p.startTime, endTime: p.endTime, isBreak: p.isBreak },
    );
    expect((await admin.put('/api/v1/timetable/periods').send({ periods: updated })).status).toBe(200);
    const week = await admin.get(`/api/v1/timetable/sections/${t.sectionId}`);
    expect(week.body.slots.find((s) => s.periodId === period('Period 1').id)).toMatchObject({ startTime: '07:50' });

    const withoutPeriod1 = updated.filter((p) => p.name !== 'Period 1');
    const removal = await admin.put('/api/v1/timetable/periods').send({ periods: withoutPeriod1 });
    expect(removal.status).toBe(409);
    expect(removal.body.error.details.periods).toEqual(['Period 1']);
  });

  test('working days come from settings', async () => {
    await admin.patch('/api/v1/institute').send({ settings: { timetable: { workingDays: [5, 1, 2, 3, 4] } } });
    const saturday = await setSlot({ sectionId: t.sectionId, dayOfWeek: 6, periodId: period('Period 3').id, subjectId: subjects.ENG });
    await admin.patch('/api/v1/institute').send({ settings: { timetable: { workingDays: [1, 2, 3, 4, 5, 6] } } });

    expect(saturday.status).toBe(400);
  });

  test('slots can be cleared', async () => {
    const created = await setSlot({ sectionId: t.sectionId, dayOfWeek: 4, periodId: period('Period 3').id, subjectId: subjects.ENG });

    expect((await admin.delete(`/api/v1/timetable/slots/${created.body.id}`)).status).toBe(204);
    expect((await admin.delete(`/api/v1/timetable/slots/${created.body.id}`)).status).toBe(404);
  });
});

describe('who sees which timetable', () => {
  test("a teacher sees their own week, including other sections", async () => {
    const res = await teacher.get('/api/v1/timetable/me');

    expect(res.body.kind).toBe('teacher');
    expect(res.body.slots.map((s) => s.section.label).sort()).toEqual(
      expect.arrayContaining(['Class 3 - A', 'Class 3 - B']),
    );
    expect(res.body.weeklyPeriods).toBe(res.body.slots.length);
  });

  test("a parent sees only their child's section", async () => {
    const parent = (await signIn(app, t, 'parent')).agent;
    await parent.post('/api/v1/auth/consent').send({ version: CONSENT_VERSION, accept: true });

    const mine = await parent.get('/api/v1/timetable/me');
    expect(mine.body).toMatchObject({ kind: 'section', section: { id: t.sectionId } });
    expect((await parent.get(`/api/v1/timetable/sections/${t.sectionId}`)).status).toBe(200);
    expect((await parent.get(`/api/v1/timetable/sections/${sectionB.id}`)).status).toBe(403);
    expect((await parent.get(`/api/v1/timetable/teachers/${staff.teacher}`)).status).toBe(403);
    expect((await parent.put('/api/v1/timetable/slots').send({})).status).toBe(403);
  });

  test('the module switch hides the timetable', async () => {
    await admin.patch('/api/v1/institute').send({ enabledModules: { timetable: false } });
    const res = await teacher.get('/api/v1/timetable/me');
    await admin.patch('/api/v1/institute').send({ enabledModules: { timetable: true } });

    expect(res.body.error.code).toBe('MODULE_DISABLED');
  });
});
