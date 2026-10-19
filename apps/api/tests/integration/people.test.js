const request = require('supertest');
const { createApp } = require('../../src/app');
const { prisma, withTenant } = require('../../src/lib/prisma');
const { createAuthTenant, signIn } = require('../helpers/auth-fixtures');

const app = createApp();
let t;
let other;
let admin;
let frontOffice;
let teacher;
let sectionId;

beforeAll(async () => {
  t = await createAuthTenant('People');
  other = await createAuthTenant('Outside');
  admin = (await signIn(app, t, 'admin')).agent;
  frontOffice = (await signIn(app, t, 'frontOffice')).agent;
  teacher = (await signIn(app, t, 'teacher')).agent;
  sectionId = (await admin.get('/api/v1/sections')).body.data[0].id;
});

afterAll(() => prisma.$disconnect());

const inTenant = (work) => withTenant(t.instituteId, work);

const newStudent = (overrides = {}) => ({
  admissionNo: `N${Math.floor(Math.random() * 1e6)}`,
  firstName: 'Meena',
  lastName: 'Joshi',
  gender: 'female',
  dateOfBirth: '2018-07-09',
  sectionId,
  guardians: [{ name: 'Prakash Joshi', phone: '9123400001', relation: 'father' }],
  ...overrides,
});

describe('students', () => {
  let meena;

  test('front office adds a student; the new parent gets a temporary password once', async () => {
    const res = await frontOffice.post('/api/v1/students').send(newStudent({ rollNo: 10 }));

    expect(res.status).toBe(201);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.student).toMatchObject({
      name: 'Meena Joshi',
      status: 'active',
      enrollments: [{ rollNo: 10, status: 'active', academicYear: { name: t.year.name } }],
      guardians: [
        {
          name: 'Prakash Joshi',
          relation: 'father',
          isPrimary: true,
          isFeePayer: true,
          hasLogin: true,
        },
      ],
    });
    expect(res.body.credentials).toEqual([
      {
        name: 'Prakash Joshi',
        phone: '9123400001',
        role: 'parent',
        temporaryPassword: expect.any(String),
      },
    ]);
    meena = res.body.student;

    const parentLogin = await request(app).post('/api/v1/auth/login').send({
      instituteCode: t.slug,
      phone: '9123400001',
      password: res.body.credentials[0].temporaryPassword,
    });
    expect(parentLogin.body).toMatchObject({ mustChangePassword: true, consentPending: true });
  });

  test('a second child with the same guardian phone is linked as a sibling, without a new login', async () => {
    const res = await frontOffice.post('/api/v1/students').send(
      newStudent({
        firstName: 'Rohit',
        gender: 'male',
        guardians: [{ name: 'Prakash Joshi', phone: '+91 91234 00001', relation: 'father' }],
      }),
    );

    expect(res.status).toBe(201);
    expect(res.body.credentials).toEqual([]);
    expect(res.body.student.siblings.map((s) => s.name)).toEqual(['Meena Joshi']);
    expect(res.body.student.guardians[0].id).toBe(meena.guardians[0].id);
  });

  test("a teacher's phone becomes a parent login too, keeping the teacher's password", async () => {
    const res = await admin.post('/api/v1/students').send(
      newStudent({
        firstName: 'Tara',
        guardians: [{ name: 'Same Teacher', phone: t.users.teacher.phone, relation: 'mother' }],
      }),
    );

    expect(res.status).toBe(201);
    expect(res.body.credentials).toEqual([]);
    const relogin = await signIn(app, t, 'teacher');
    expect(relogin.res.body.profiles.map((p) => p.roleCode)).toEqual(['teacher', 'parent']);
  });

  test('duplicate admission numbers and roll numbers are rejected', async () => {
    const dupAdmission = await admin.post('/api/v1/students').send(
      newStudent({
        admissionNo: meena.admissionNo,
        guardians: [{ name: 'X', phone: '9123400099' }],
      }),
    );
    const dupRoll = await admin
      .post('/api/v1/students')
      .send(newStudent({ rollNo: 10, guardians: [{ name: 'Y', phone: '9123400098' }] }));

    expect(dupAdmission.status).toBe(409);
    expect(dupRoll.status).toBe(409);
  });

  test('validation: at least one guardian, real dates, distinct phones', async () => {
    const noGuardian = await admin.post('/api/v1/students').send(newStudent({ guardians: [] }));
    const badDate = await admin
      .post('/api/v1/students')
      .send(newStudent({ dateOfBirth: '2018-02-30' }));
    const samePhones = await admin.post('/api/v1/students').send(
      newStudent({
        guardians: [
          { name: 'A', phone: '9123400010' },
          { name: 'B', phone: '9123400010' },
        ],
      }),
    );

    expect(noGuardian.status).toBe(400);
    expect(badDate.status).toBe(400);
    expect(samePhones.status).toBe(400);
  });

  test('lists with search and filters, and teachers can view but not add', async () => {
    const byName = await teacher.get('/api/v1/students?q=meena');
    const byGuardianPhone = await admin.get('/api/v1/students?q=91234000');
    const bySection = await admin.get(`/api/v1/students?sectionId=${sectionId}&limit=100`);

    expect(byName.body.data.map((s) => s.name)).toEqual(['Meena Joshi']);
    expect(byName.body.data[0]).toMatchObject({
      enrollment: { rollNo: 10 },
      primaryGuardian: { name: 'Prakash Joshi', phone: '9123400001' },
    });
    expect(byGuardianPhone.body.data.map((s) => s.firstName).sort()).toEqual(['Meena', 'Rohit']);
    expect(bySection.body.meta.total).toBeGreaterThanOrEqual(6);
    expect((await teacher.post('/api/v1/students').send(newStudent())).status).toBe(403);
  });

  test('edits are audited with before and after values', async () => {
    const res = await admin
      .patch(`/api/v1/students/${meena.id}`)
      .send({ bloodGroup: 'o+', address: '7 Lake Road' });
    const audit = await inTenant((tx) =>
      tx.auditLog.findFirst({ where: { action: 'student.update', entityId: meena.id } }),
    );

    expect(res.body).toMatchObject({ bloodGroup: 'O+', address: '7 Lake Road' });
    expect(audit.before).toEqual({ bloodGroup: null, address: null });
    expect(audit.after).toEqual({ bloodGroup: 'O+', address: '7 Lake Road' });
  });

  test('leaving is a status change: the record stays and the enrollment is closed', async () => {
    const res = await admin
      .post(`/api/v1/students/${meena.id}/status`)
      .send({ status: 'transferred', reason: 'Moved to Delhi' });

    expect(res.body).toMatchObject({ status: 'transferred', statusReason: 'Moved to Delhi' });
    expect(res.body.enrollments[0]).toMatchObject({
      status: 'transferred',
      leftOn: expect.any(String),
    });
    expect((await admin.get('/api/v1/students?q=meena')).body.data).toEqual([]);
    expect((await admin.get('/api/v1/students?q=meena&status=all')).body.data).toHaveLength(1);
    expect(
      (await teacher.post(`/api/v1/students/${meena.id}/status`).send({ status: 'active' })).status,
    ).toBe(403);
  });

  test('guardians can be added, updated and unlinked, but the last one stays', async () => {
    const created = await admin
      .post('/api/v1/students')
      .send(newStudent({ guardians: [{ name: 'Only Parent', phone: '9123400050' }] }));
    const id = created.body.student.id;
    const firstGuardian = created.body.student.guardians[0].id;

    const added = await admin
      .post(`/api/v1/students/${id}/guardians`)
      .send({ name: 'Second Parent', phone: '9123400051', relation: 'mother', isPrimary: true });
    expect(added.status).toBe(201);
    expect(added.body.credentials).toHaveLength(1);
    expect(added.body.student.guardians.map((g) => [g.name, g.isPrimary])).toEqual([
      ['Second Parent', true],
      ['Only Parent', false],
    ]);

    const second = added.body.student.guardians[0].id;
    expect((await admin.delete(`/api/v1/students/${id}/guardians/${firstGuardian}`)).status).toBe(
      200,
    );
    expect((await admin.delete(`/api/v1/students/${id}/guardians/${second}`)).status).toBe(409);
  });

  test('moving to another section in the same year updates the enrollment', async () => {
    const level = (await admin.get('/api/v1/levels')).body.data[0];
    const year = (await admin.get('/api/v1/academic-years?status=current')).body.data[0];
    const b = await admin
      .post('/api/v1/sections')
      .send({ academicYearId: year.id, levelId: level.id, name: 'B' });
    const created = await admin
      .post('/api/v1/students')
      .send(newStudent({ guardians: [{ name: 'Mover', phone: '9123400060' }] }));

    const moved = await admin
      .put(`/api/v1/students/${created.body.student.id}/enrollment`)
      .send({ sectionId: b.body.id, rollNo: 3 });

    expect(moved.body.enrollments).toHaveLength(1);
    expect(moved.body.enrollments[0]).toMatchObject({ rollNo: 3, section: { name: 'B' } });
  });

  test("another institute's admin cannot see or change these students", async () => {
    const outsider = (await signIn(app, other, 'admin')).agent;

    expect((await outsider.get(`/api/v1/students/${meena.id}`)).status).toBe(404);
    expect(
      (await outsider.patch(`/api/v1/students/${meena.id}`).send({ firstName: 'X' })).status,
    ).toBe(404);
    expect((await outsider.get('/api/v1/students?q=meena&status=all')).body.data).toEqual([]);
  });
});

describe('guardians', () => {
  test('search by phone shows all children; phone cannot be edited', async () => {
    const res = await admin.get('/api/v1/guardians?q=9123400001');
    const guardian = res.body.data[0];

    expect(guardian.children.map((c) => c.name).sort()).toEqual(['Meena Joshi', 'Rohit Joshi']);
    expect(
      (await admin.patch(`/api/v1/guardians/${guardian.id}`).send({ phone: '9000000000' })).status,
    ).toBe(400);
    expect(
      (await admin.patch(`/api/v1/guardians/${guardian.id}`).send({ occupation: 'Engineer' })).body
        .occupation,
    ).toBe('Engineer');
  });
});

describe('staff', () => {
  let kavita;

  test('an admin adds a teacher with a login and a temporary password', async () => {
    const res = await admin.post('/api/v1/staff').send({
      employeeCode: 'T-900',
      name: 'Kavita Rao',
      phone: '9123400200',
      designation: 'Teacher',
      joiningDate: '2026-06-01',
    });

    expect(res.status).toBe(201);
    expect(res.body.staff).toMatchObject({
      name: 'Kavita Rao',
      hasLogin: true,
      login: { mustChangePassword: true, roles: [{ code: 'teacher' }] },
    });
    expect(res.body.credentials[0]).toMatchObject({ phone: '9123400200', role: 'teacher' });
    kavita = res.body.staff;
  });

  test('front office cannot add staff; nobody can hand out roles above their own', async () => {
    expect(
      (
        await frontOffice
          .post('/api/v1/staff')
          .send({ employeeCode: 'T-901', name: 'X', phone: '9123400201' })
      ).status,
    ).toBe(403);
  });

  test('marking a teacher as left removes staff roles and blocks the login', async () => {
    const res = await admin.patch(`/api/v1/staff/${kavita.id}`).send({ status: 'left' });

    expect(res.body.status).toBe('left');
    expect(res.body.login).toMatchObject({ status: 'disabled', roles: [] });
    const user = await inTenant((tx) => tx.user.findFirst({ where: { phone: '9123400200' } }));
    expect(user.status).toBe('disabled');
  });

  test('staff list supports search and status filters', async () => {
    const active = await admin.get('/api/v1/staff?q=kavita');
    const all = await admin.get('/api/v1/staff?q=kavita&status=all');

    expect(active.body.data).toEqual([]);
    expect(all.body.data.map((s) => s.employeeCode)).toEqual(['T-900']);
  });
});
