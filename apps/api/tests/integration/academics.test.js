const { createApp } = require('../../src/app');
const { prisma, withTenant } = require('../../src/lib/prisma');
const { createAuthTenant, signIn } = require('../helpers/auth-fixtures');

const app = createApp();
let t;
let other;
let admin;
let teacher;

beforeAll(async () => {
  t = await createAuthTenant('Acad');
  other = await createAuthTenant('Elsewhere');
  admin = (await signIn(app, t, 'admin')).agent;
  teacher = (await signIn(app, t, 'teacher')).agent;
});

afterAll(() => prisma.$disconnect());

const inTenant = (work) => withTenant(t.instituteId, work);
const staffIdOf = (tenant, userKey) =>
  withTenant(
    tenant.instituteId,
    async (tx) => (await tx.staff.findFirst({ where: { userId: tenant.users[userKey].id } })).id,
  );

describe('academic years', () => {
  test('creates a year, rejects overlaps and bad ranges, and keeps one current year', async () => {
    const next = await admin
      .post('/api/v1/academic-years')
      .send({ name: '2027-28', startDate: '2027-04-01', endDate: '2028-03-31' });
    expect(next.status).toBe(201);
    expect(next.body).toMatchObject({ status: 'upcoming', startDate: '2027-04-01' });

    const overlap = await admin
      .post('/api/v1/academic-years')
      .send({ name: 'Overlap', startDate: '2027-01-01', endDate: '2027-06-30' });
    const backwards = await admin
      .post('/api/v1/academic-years')
      .send({ name: '2030-31', startDate: '2031-03-31', endDate: '2030-04-01' });
    const fakeDate = await admin
      .post('/api/v1/academic-years')
      .send({ name: '2030-31', startDate: '2030-02-30', endDate: '2031-03-31' });
    expect(overlap.status).toBe(409);
    expect(backwards.status).toBe(400);
    expect(fakeDate.status).toBe(400);

    const switched = await admin.post(`/api/v1/academic-years/${next.body.id}/make-current`);
    expect(switched.body.status).toBe('current');

    const years = (await admin.get('/api/v1/academic-years')).body.data;
    expect(years.filter((y) => y.status === 'current').map((y) => y.name)).toEqual(['2027-28']);
    expect(years.find((y) => y.name === '2026-27').status).toBe('closed');

    const sequence = await inTenant((tx) =>
      tx.receiptSequence.findFirst({ where: { academicYearId: next.body.id } }),
    );
    expect(sequence).toMatchObject({ lastValue: 0 });

    // Restore 2026-27 as current for the remaining tests.
    await admin.post(
      `/api/v1/academic-years/${years.find((y) => y.name === '2026-27').id}/make-current`,
    );
  });

  test('two concurrent "make current" calls still leave exactly one current year', async () => {
    const years = (await admin.get('/api/v1/academic-years')).body.data;
    await Promise.all(years.map((y) => admin.post(`/api/v1/academic-years/${y.id}/make-current`)));

    const current = await inTenant((tx) =>
      tx.academicYear.count({ where: { instituteId: t.instituteId, status: 'current' } }),
    );
    expect(current).toBe(1);

    const y2026 = years.find((y) => y.name === '2026-27');
    await admin.post(`/api/v1/academic-years/${y2026.id}/make-current`);
  });

  test('a year with sections cannot be deleted; an unused one can', async () => {
    const years = (await admin.get('/api/v1/academic-years')).body.data;
    const used = years.find((y) => y.name === '2026-27');
    const unused = years.find((y) => y.name === '2027-28');

    expect((await admin.delete(`/api/v1/academic-years/${used.id}`)).status).toBe(409);
    expect((await admin.delete(`/api/v1/academic-years/${unused.id}`)).status).toBe(204);
  });

  test('teachers can view academic years but not change them', async () => {
    expect((await teacher.get('/api/v1/academic-years')).status).toBe(200);
    const res = await teacher
      .post('/api/v1/academic-years')
      .send({ name: '2040-41', startDate: '2040-04-01', endDate: '2041-03-31' });
    expect(res.status).toBe(403);
  });
});

describe('classes (levels) and sections', () => {
  test('creates Class 1-12 with grade bands, skipping existing names', async () => {
    const res = await admin.post('/api/v1/levels/range').send({ from: 1, to: 12 });

    expect(res.status).toBe(201);
    expect(res.body.created).toBe(11); // "Class 3" came from the fixture
    const bands = Object.fromEntries(res.body.data.map((l) => [l.name, l.band]));
    expect(bands).toMatchObject({
      'Class 1': 'primary',
      'Class 6': 'middle',
      'Class 10': 'secondary',
      'Class 12': 'senior',
    });

    const again = await admin.post('/api/v1/levels/range').send({ from: 1, to: 12 });
    expect(again.body).toMatchObject({ created: 0, skipped: 12 });
  });

  test('creates sections A and B for several classes in one call', async () => {
    const levels = (await admin.get('/api/v1/levels?limit=100')).body.data;
    const year = (await admin.get('/api/v1/academic-years?status=current')).body.data[0];
    const levelIds = levels.filter((l) => ['Class 1', 'Class 2'].includes(l.name)).map((l) => l.id);

    const res = await admin
      .post('/api/v1/sections/grid')
      .send({ academicYearId: year.id, levelIds, names: ['A', 'B', 'A'], capacity: 40 });
    const list = await admin.get(`/api/v1/sections?levelId=${levelIds[0]}`);

    expect(res.body).toEqual({ created: 4, skipped: 0 });
    expect(list.body.data.map((s) => s.name)).toEqual(['A', 'B']);
    expect(list.body.data[0]).toMatchObject({
      capacity: 40,
      studentCount: 0,
      level: { name: 'Class 1' },
    });
  });

  test('duplicate section names in the same class and year are rejected', async () => {
    const level = (await admin.get('/api/v1/levels?limit=100')).body.data.find(
      (l) => l.name === 'Class 1',
    );
    const year = (await admin.get('/api/v1/academic-years?status=current')).body.data[0];

    const res = await admin
      .post('/api/v1/sections')
      .send({ academicYearId: year.id, levelId: level.id, name: 'A' });
    expect(res.status).toBe(409);
  });

  test('assigns a class teacher, but never a teacher from another institute', async () => {
    const sections = (await admin.get('/api/v1/sections?limit=100')).body.data;
    const section = sections.find((s) => s.level.name === 'Class 1' && s.name === 'A');

    const mine = await admin
      .patch(`/api/v1/sections/${section.id}`)
      .send({ classTeacherStaffId: await staffIdOf(t, 'teacher'), room: '1A' });
    const foreign = await admin
      .patch(`/api/v1/sections/${section.id}`)
      .send({ classTeacherStaffId: await staffIdOf(other, 'teacher') });

    expect(mine.status).toBe(200);
    expect(mine.body).toMatchObject({ room: '1A', classTeacher: { name: 'Acad teacher' } });
    expect(foreign.status).toBe(400);
  });

  test('a class with sections cannot be deleted', async () => {
    const level = (await admin.get('/api/v1/levels?limit=100')).body.data.find(
      (l) => l.name === 'Class 1',
    );
    expect((await admin.delete(`/api/v1/levels/${level.id}`)).status).toBe(409);
  });

  test('a section with students cannot be deleted; an empty one can', async () => {
    const sections = (await admin.get('/api/v1/sections?limit=100')).body.data;
    const withStudents = sections.find((s) => s.level.name === 'Class 3');
    const empty = sections.find((s) => s.level.name === 'Class 2' && s.name === 'B');

    expect(withStudents.studentCount).toBe(3);
    expect((await admin.delete(`/api/v1/sections/${withStudents.id}`)).status).toBe(409);
    expect((await admin.delete(`/api/v1/sections/${empty.id}`)).status).toBe(204);
  });
});

describe('subjects and section-subject-teacher mapping', () => {
  let section;
  let subjects;

  beforeAll(async () => {
    const created = await admin.post('/api/v1/subjects').send({
      subjects: [
        { name: 'English', code: 'eng' },
        { name: 'Mathematics', code: 'MATH' },
        { name: 'EVS', code: 'EVS' },
      ],
    });
    subjects = Object.fromEntries(created.body.data.map((s) => [s.code, s]));
    section = (await admin.get('/api/v1/sections?limit=100')).body.data.find(
      (s) => s.level.name === 'Class 1' && s.name === 'A',
    );
  });

  test('codes are normalised to upper case and must be unique', async () => {
    expect(Object.keys(subjects).sort()).toEqual(['ENG', 'EVS', 'MATH']);
    expect(
      (await admin.post('/api/v1/subjects').send({ name: 'English 2', code: 'ENG' })).body,
    ).toMatchObject({ created: 0, skipped: 1 });
    expect(
      (await admin.patch(`/api/v1/subjects/${subjects.EVS.id}`).send({ code: 'MATH' })).status,
    ).toBe(409);
  });

  test('sets the subjects of a section with their teachers, replacing the previous list', async () => {
    const teacherId = await staffIdOf(t, 'teacher');
    const first = await admin.put(`/api/v1/sections/${section.id}/subjects`).send({
      items: [
        { subjectId: subjects.ENG.id, teacherStaffId: teacherId },
        { subjectId: subjects.MATH.id },
      ],
    });
    expect(first.status).toBe(200);
    expect(first.body.data.map((row) => [row.subject.code, row.teacher?.name ?? null])).toEqual([
      ['ENG', 'Acad teacher'],
      ['MATH', null],
    ]);

    const second = await admin.put(`/api/v1/sections/${section.id}/subjects`).send({
      items: [
        { subjectId: subjects.MATH.id, teacherStaffId: teacherId },
        { subjectId: subjects.EVS.id },
      ],
    });
    expect(second.body.data.map((row) => row.subject.code)).toEqual(['EVS', 'MATH']);

    const audit = await inTenant((tx) =>
      tx.auditLog.findFirst({
        where: { action: 'section.subjects_update', entityId: section.id },
        orderBy: { createdAt: 'desc' },
      }),
    );
    expect(audit.before).toEqual([
      { subject: 'ENG', teacher: 'Acad teacher' },
      { subject: 'MATH', teacher: null },
    ]);
  });

  test("rejects another institute's teacher or subject and duplicate subjects", async () => {
    const foreignTeacher = await admin.put(`/api/v1/sections/${section.id}/subjects`).send({
      items: [{ subjectId: subjects.ENG.id, teacherStaffId: await staffIdOf(other, 'teacher') }],
    });
    const duplicate = await admin.put(`/api/v1/sections/${section.id}/subjects`).send({
      items: [{ subjectId: subjects.ENG.id }, { subjectId: subjects.ENG.id }],
    });

    expect(foreignTeacher.status).toBe(400);
    expect(duplicate.status).toBe(400);
  });

  test('a subject in use cannot be deleted, but can be deactivated', async () => {
    expect((await admin.delete(`/api/v1/subjects/${subjects.MATH.id}`)).status).toBe(409);
    const inactive = await admin
      .patch(`/api/v1/subjects/${subjects.MATH.id}`)
      .send({ isActive: false });
    expect(inactive.body.isActive).toBe(false);
    expect((await admin.get('/api/v1/subjects')).body.data.map((s) => s.code)).not.toContain(
      'MATH',
    );
  });

  test("another institute's admin cannot see or change this section", async () => {
    const outsider = (await signIn(app, other, 'admin')).agent;

    expect((await outsider.get(`/api/v1/sections/${section.id}/subjects`)).status).toBe(404);
    expect(
      (await outsider.patch(`/api/v1/sections/${section.id}`).send({ room: 'X' })).status,
    ).toBe(404);
  });
});

describe('institute settings and setup wizard', () => {
  test('setup status reports each step; completion needs every step', async () => {
    const status = await admin.get('/api/v1/institute/setup');
    expect(status.body.steps).toEqual({
      profile: false,
      academicYear: true,
      levels: true,
      sections: true,
      subjects: true,
    });
    expect((await admin.post('/api/v1/institute/setup/complete')).status).toBe(409);

    const profile = await admin.post('/api/v1/institute/setup/profile').send({
      name: 'Acad Public School',
      board: 'STATE',
      boardName: 'Maharashtra State Board',
      settings: { labels: { level: 'Standard' } },
    });
    expect(profile.body.steps.profile).toBe(true);

    const done = await admin.post('/api/v1/institute/setup/complete');
    expect(done.body.completed).toBe(true);
  });

  test('settings merge instead of replacing, and unknown keys are rejected', async () => {
    await admin
      .patch('/api/v1/institute')
      .send({ settings: { attendance: { editWindowDays: 3 } } });
    const res = await admin.get('/api/v1/institute');

    expect(res.body.settings).toMatchObject({
      labels: { level: 'Standard' },
      attendance: { editWindowDays: 3 },
    });
    expect(res.body.settings.setup.completedAt).toBeDefined();
    expect(
      (await admin.patch('/api/v1/institute').send({ settings: { colour: 'red' } })).status,
    ).toBe(400);
  });

  test('module switches change what the session reports', async () => {
    await admin.patch('/api/v1/institute').send({ enabledModules: { fees: false } });
    const me = await admin.get('/api/v1/auth/me');

    expect(me.body.institute.enabledModules).toMatchObject({ fees: false, attendance: true });
    await admin.patch('/api/v1/institute').send({ enabledModules: { fees: true } });
  });

  test('only institute managers can change settings', async () => {
    expect((await teacher.patch('/api/v1/institute').send({ name: 'Hacked' })).status).toBe(403);
  });
});
