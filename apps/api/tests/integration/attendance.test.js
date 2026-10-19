const { createApp } = require('../../src/app');
const { prisma, withTenant } = require('../../src/lib/prisma');
const { CONSENT_VERSION } = require('../../src/config/consent');
const { createAuthTenant, signIn } = require('../helpers/auth-fixtures');
const { schoolYears, daysAgo } = require('../helpers/school-year');

const app = createApp();
const SY = schoolYears();
let t;
let admin;
let teacher;
let otherTeacher;

beforeAll(async () => {
  t = await createAuthTenant('Attend');
  admin = (await signIn(app, t, 'admin')).agent;
  teacher = (await signIn(app, t, 'teacher')).agent;
  otherTeacher = (await signIn(app, t, 'pwdUser')).agent;
});

afterAll(() => prisma.$disconnect());

const inTenant = (work) => withTenant(t.instituteId, work);
const save = (agent, body) =>
  agent.put('/api/v1/attendance/roster').send({ sectionId: t.sectionId, ...body });
const notificationsFor = (userKey) =>
  inTenant((tx) =>
    tx.notification.findMany({
      where: { userId: t.users[userKey].id, type: 'attendance.absent' },
      orderBy: { createdAt: 'asc' },
    }),
  );

describe('who can mark', () => {
  test('a teacher without the section sees it read-only and cannot save', async () => {
    const sections = await teacher.get('/api/v1/attendance/sections');
    const roster = await teacher.get(`/api/v1/attendance/roster?sectionId=${t.sectionId}`);
    const saved = await save(teacher, { records: [] });

    expect(sections.body.data).toEqual([]);
    expect(roster.body).toMatchObject({ canMark: false, lockedReason: 'not_assigned' });
    expect(saved.status).toBe(403);
  });

  test('after becoming class teacher, the section appears and defaults everyone to present', async () => {
    const staffId = await inTenant(
      async (tx) => (await tx.staff.findFirst({ where: { userId: t.users.teacher.id } })).id,
    );
    await admin.patch(`/api/v1/sections/${t.sectionId}`).send({ classTeacherStaffId: staffId });

    const sections = await teacher.get('/api/v1/attendance/sections');
    const roster = await teacher.get(`/api/v1/attendance/roster?sectionId=${t.sectionId}`);

    expect(sections.body.data).toEqual([
      expect.objectContaining({
        id: t.sectionId,
        isClassTeacher: true,
        studentCount: 3,
        markedToday: [],
      }),
    ]);
    expect(roster.body).toMatchObject({
      canMark: true,
      marked: false,
      date: SY.today,
      session: 'full_day',
    });
    expect(roster.body.students.map((s) => [s.rollNo, s.status, s.saved])).toEqual([
      [1, 'present', false],
      [2, 'present', false],
      [3, 'present', false],
    ]);
  });
});

describe('marking and absence alerts', () => {
  test('one tap: only absentees are sent; guardians of absent children are notified', async () => {
    const res = await save(teacher, {
      records: [{ studentId: t.students.child1, status: 'absent', remark: 'No information' }],
    });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      marked: true,
      summary: { marked: 3, present: 2, absent: 1 },
      saved: { created: 3, changed: 0, notified: 1 },
    });
    const notices = await notificationsFor('parent');
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({
      title: 'Asha Attend was absent',
      entityId: t.students.child1,
    });

    const audit = await inTenant((tx) =>
      tx.auditLog.findFirst({ where: { action: 'attendance.mark' } }),
    );
    expect(audit.after).toMatchObject({ absent: 1, present: 2 });
  });

  test('saving again does not notify twice; a new absence notifies once; corrections are audited', async () => {
    await save(teacher, {
      records: [{ studentId: t.students.child1, status: 'absent', remark: 'No information' }],
    });
    const changed = await save(teacher, {
      records: [
        { studentId: t.students.child1, status: 'present' },
        { studentId: t.students.child2, status: 'absent' },
      ],
    });

    expect(changed.body.saved).toEqual({ created: 0, changed: 2, notified: 1 });
    expect(await notificationsFor('parent')).toHaveLength(2);

    const audit = await inTenant((tx) =>
      tx.auditLog.findFirst({
        where: { action: 'attendance.update' },
        orderBy: { createdAt: 'desc' },
      }),
    );
    expect(audit.before).toEqual(
      expect.arrayContaining([
        { studentId: t.students.child1, status: 'absent', remark: 'No information' },
        { studentId: t.students.child2, status: 'present', remark: null },
      ]),
    );
  });

  test('a teacher who is also a parent gets the alert for their own child', async () => {
    await save(teacher, { records: [{ studentId: t.students.child3, status: 'absent' }] });

    expect(await notificationsFor('teacherParent')).toHaveLength(1);
  });

  test('students outside the section and duplicate entries are rejected', async () => {
    const outsider = await save(teacher, {
      records: [{ studentId: '00000000-0000-4000-8000-000000000000', status: 'absent' }],
    });
    const duplicate = await save(teacher, {
      records: [
        { studentId: t.students.child1, status: 'absent' },
        { studentId: t.students.child1, status: 'present' },
      ],
    });

    expect(outsider.status).toBe(400);
    expect(duplicate.status).toBe(400);
  });

  test('two saves at the same moment still give one record per student', async () => {
    const date = daysAgo(1);
    const results = await Promise.all([
      save(teacher, { date, records: [{ studentId: t.students.child1, status: 'late' }] }),
      save(admin, { date, records: [{ studentId: t.students.child2, status: 'absent' }] }),
    ]);

    expect(results.map((r) => r.status)).toEqual([200, 200]);
    const counts = await inTenant(async (tx) => ({
      sessions: await tx.attendanceSession.count({
        where: { sectionId: t.sectionId, date: new Date(`${date}T00:00:00Z`) },
      }),
      records: await tx.attendanceRecord.count({ where: { date: new Date(`${date}T00:00:00Z`) } }),
    }));
    expect(counts).toEqual({ sessions: 1, records: 3 });
  });
});

describe('date, session and edit-window rules', () => {
  const old = daysAgo(5);
  const oldIsInYear = old >= SY.current.startDate;

  test('future dates are rejected', async () => {
    const tomorrow = new Date(`${SY.today}T00:00:00Z`);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const res = await save(teacher, { date: tomorrow.toISOString().slice(0, 10), records: [] });

    expect(res.status).toBe(400);
  });

  (oldIsInYear ? test : test.skip)(
    'teachers cannot change days outside the edit window; admins can',
    async () => {
      const byTeacher = await save(teacher, { date: old, records: [] });
      const roster = await teacher.get(
        `/api/v1/attendance/roster?sectionId=${t.sectionId}&date=${old}`,
      );
      const byAdmin = await save(admin, { date: old, records: [] });

      expect(byTeacher.status).toBe(403);
      expect(byTeacher.body.error.details.editableUntil).toBe(daysAgo(3));
      expect(roster.body).toMatchObject({ canMark: false, lockedReason: 'edit_window_closed' });
      expect(byAdmin.status).toBe(200);
    },
  );

  test('sessions follow the institute setting (once or twice a day)', async () => {
    expect((await save(teacher, { session: 'morning', records: [] })).status).toBe(400);

    await admin
      .patch('/api/v1/institute')
      .send({ settings: { attendance: { sessionsPerDay: 2 } } });
    const fullDay = await save(teacher, { session: 'full_day', records: [] });
    const morning = await save(teacher, { session: 'morning', records: [] });
    await admin
      .patch('/api/v1/institute')
      .send({ settings: { attendance: { sessionsPerDay: 1 } } });

    expect(fullDay.status).toBe(400);
    expect(morning.status).toBe(200);
    expect(morning.body.sessionTypes).toEqual(['morning', 'afternoon']);
  });

  test('a teacher with no link to the section still cannot mark it', async () => {
    expect((await save(otherTeacher, { records: [] })).status).toBe(403);
  });

  test('the module switch blocks attendance completely', async () => {
    await admin.patch('/api/v1/institute').send({ enabledModules: { attendance: false } });
    const res = await teacher.get('/api/v1/attendance/sections');
    await admin.patch('/api/v1/institute').send({ enabledModules: { attendance: true } });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('MODULE_DISABLED');
  });
});

describe('reports', () => {
  test('daily report shows every section with its counts', async () => {
    const res = await teacher.get('/api/v1/attendance/reports/daily');
    const section = res.body.sections.find((s) => s.id === t.sectionId);

    // Today has the full-day register (1 present, 2 absent) and the morning one saved while the
    // institute briefly took attendance twice a day (3 present by default).
    expect(section).toMatchObject({
      enrolled: 3,
      sessionsMarked: 2,
      marked: 6,
      absent: 2,
      present: 4,
    });
    expect(res.body.totals).toMatchObject({ sections: 1, sectionsMarked: 1 });
  });

  test('monthly register lists each marked day per student with a percentage', async () => {
    const res = await admin.get(`/api/v1/attendance/reports/monthly?sectionId=${t.sectionId}`);
    const asha = res.body.students.find((s) => s.id === t.students.child1);
    const todayIndex = res.body.sessions.findIndex(
      (s) => s.date === SY.today && s.session === 'full_day',
    );

    expect(todayIndex).toBeGreaterThanOrEqual(0);
    expect(asha.marks[todayIndex]).toBe('present');
    expect(asha.summary.marked).toBe(res.body.sessions.length);
    expect(asha.summary.percentage).toBeGreaterThan(0);
  });

  test('parents cannot open staff reports', async () => {
    const parent = (await signIn(app, t, 'parent')).agent;
    await parent.post('/api/v1/auth/consent').send({ version: CONSENT_VERSION, accept: true });

    expect((await parent.get('/api/v1/attendance/reports/daily')).status).toBe(403);
  });
});

describe('parent and student view', () => {
  test("a parent sees the active child's month, and switching shows the sibling", async () => {
    const { agent, res: login } = await signIn(app, t, 'parent');
    await agent.post('/api/v1/auth/consent').send({ version: CONSENT_VERSION, accept: true });

    const first = await agent.get('/api/v1/attendance/me');
    expect(first.status).toBe(200);
    expect(first.body.student.id).toBe(t.students.child1);
    expect(first.body.days.find((d) => d.date === SY.today)).toMatchObject({ status: 'present' });

    const bala = login.body.profiles.find((p) => p.id === t.students.child2);
    await agent.post('/api/v1/auth/switch-profile').send({ profileKey: bala.key });
    const second = await agent.get('/api/v1/attendance/me');
    expect(second.body.student.id).toBe(t.students.child2);
    expect(second.body.days.find((d) => d.date === SY.today)).toMatchObject({ status: 'absent' });
    expect(second.body.summary.absent).toBeGreaterThanOrEqual(1);
  });

  test("a student sees their own attendance; staff have no 'own' view", async () => {
    const student = (await signIn(app, t, 'student')).agent;
    const own = await student.get('/api/v1/attendance/me');

    expect(own.body.student.id).toBe(t.students.child2);
    expect((await teacher.get('/api/v1/attendance/me')).status).toBe(403);
  });
});
