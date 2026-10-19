const request = require('supertest');
const jwt = require('jsonwebtoken');
const { createApp } = require('../../src/app');
const { prisma, withTenant } = require('../../src/lib/prisma');
const { createAuthTenant, signIn, PASSWORD } = require('../helpers/auth-fixtures');

const app = createApp();
let t;
let other;

beforeAll(async () => {
  t = await createAuthTenant('Rbac');
  other = await createAuthTenant('Other');
});

afterAll(() => prisma.$disconnect());

const inTenant = (work) => withTenant(t.instituteId, work);

async function agentFor(userKey, tenant = t) {
  const { agent, res } = await signIn(app, tenant, userKey);
  expect(res.status).toBe(200);
  return { agent, session: res.body };
}

describe('permission checks', () => {
  test('a teacher cannot list users; an admin can, with pagination', async () => {
    const teacher = await agentFor('teacher');
    const admin = await agentFor('admin');

    const denied = await teacher.agent.get('/api/v1/users');
    const page = await admin.agent.get('/api/v1/users?page=1&limit=3');

    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('FORBIDDEN');
    expect(page.status).toBe(200);
    expect(page.body.data).toHaveLength(3);
    expect(page.body.meta).toMatchObject({ page: 1, limit: 3, total: 10, totalPages: 4 });
    expect(page.body.data[0]).not.toHaveProperty('passwordHash');
  });

  test('list endpoints validate pagination and filters', async () => {
    const admin = await agentFor('admin');

    expect((await admin.agent.get('/api/v1/users?limit=1000')).status).toBe(400);
    const parents = await admin.agent.get('/api/v1/users?role=parent');
    expect(parents.body.data.map((u) => u.id).sort()).toEqual(
      [t.users.parent.id, t.users.teacherParent.id].sort(),
    );
  });

  test('each institute only sees its own users', async () => {
    const admin = await agentFor('admin');
    const res = await admin.agent.get('/api/v1/users?limit=100');

    expect(res.body.data.every((u) => u.name.startsWith('Rbac '))).toBe(true);
  });
});

describe('admin password reset', () => {
  test('front office resets a teacher: temporary password, forced change, sessions revoked', async () => {
    const teacherSession = await agentFor('teacher');
    const frontOffice = await agentFor('frontOffice');

    const res = await frontOffice.agent.post(`/api/v1/users/${t.users.teacher.id}/reset-password`);

    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.temporaryPassword).toMatch(/^.{10}$/);
    expect((await teacherSession.agent.post('/api/v1/auth/refresh')).status).toBe(401);
    expect((await signIn(app, t, 'teacher')).res.status).toBe(401);

    const relogin = await signIn(app, t, 'teacher', res.body.temporaryPassword);
    expect(relogin.res.body.mustChangePassword).toBe(true);
    await relogin.agent
      .post('/api/v1/auth/change-password')
      .send({ currentPassword: res.body.temporaryPassword, newPassword: PASSWORD });

    const audit = await inTenant((tx) =>
      tx.auditLog.findFirst({
        where: { action: 'user.password_reset', entityId: t.users.teacher.id },
      }),
    );
    expect(audit.userId).toBe(t.users.frontOffice.id);
    expect(JSON.stringify(audit)).not.toContain(res.body.temporaryPassword);
  });

  test('an access token issued before the reset stops working immediately', async () => {
    const before = jwt.sign(
      { iid: t.instituteId, rid: t.roleIds.teacher, role: 'teacher', pt: 'staff', pid: null },
      process.env.JWT_ACCESS_SECRET,
      {
        subject: t.users.pwdUser.id,
        issuer: 'erplms-api',
        audience: 'erplms-access',
        expiresIn: 600,
      },
    );
    const asBefore = () => request(app).get('/api/v1/auth/me').set('Cookie', `erp_at=${before}`);
    expect((await asBefore()).status).toBe(200);

    await inTenant((tx) =>
      tx.user.update({
        where: { id: t.users.pwdUser.id },
        data: { passwordChangedAt: new Date(Date.now() + 2000) },
      }),
    );

    expect((await asBefore()).body.error.code).toBe('SESSION_EXPIRED');
  });

  test('nobody can reset the password of someone with more privileged access', async () => {
    const frontOffice = await agentFor('frontOffice');
    const res = await frontOffice.agent.post(`/api/v1/users/${t.users.admin.id}/reset-password`);

    expect(res.status).toBe(403);
    expect(res.body.error.details.missing).toContain('fees.collect');
  });

  test('teachers cannot reset passwords and nobody resets their own', async () => {
    const teacher = await agentFor('teacherParent');
    const admin = await agentFor('admin');

    expect(
      (await teacher.agent.post(`/api/v1/users/${t.users.parent.id}/reset-password`)).status,
    ).toBe(403);
    expect(
      (await admin.agent.post(`/api/v1/users/${t.users.admin.id}/reset-password`)).status,
    ).toBe(400);
  });

  test("an admin cannot reach another institute's users", async () => {
    const admin = await agentFor('admin');
    const res = await admin.agent.post(`/api/v1/users/${other.users.teacher.id}/reset-password`);

    expect(res.status).toBe(404);
  });
});

describe('roles as data', () => {
  let librarianRoleId;

  test('an admin creates a custom role and assigns it; it appears as a new profile', async () => {
    const admin = await agentFor('admin');
    const created = await admin.agent
      .post('/api/v1/roles')
      .send({ code: 'librarian', name: 'Librarian', permissions: ['users.view', 'students.view'] });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      isSystem: false,
      permissions: ['students.view', 'users.view'],
    });
    librarianRoleId = created.body.id;

    const assigned = await admin.agent
      .post(`/api/v1/users/${t.users.teacherParent.id}/roles`)
      .send({ roleId: librarianRoleId });
    expect(assigned.status).toBe(201);
    expect(assigned.body.roles.map((r) => r.code)).toContain('librarian');

    const { agent, session } = await agentFor('teacherParent');
    const librarian = session.profiles.find((p) => p.roleCode === 'librarian');
    expect((await agent.get('/api/v1/users')).status).toBe(403);

    await agent.post('/api/v1/auth/switch-profile').send({ profileKey: librarian.key });
    expect((await agent.get('/api/v1/users')).status).toBe(200);

    // Permission changes apply on the very next request, without signing in again.
    await admin.agent
      .put(`/api/v1/roles/${librarianRoleId}/permissions`)
      .send({ permissions: ['students.view'] });
    expect((await agent.get('/api/v1/users')).status).toBe(403);

    const actions = (
      await inTenant((tx) => tx.auditLog.findMany({ where: { userId: t.users.admin.id } }))
    ).map((row) => row.action);
    expect(actions).toEqual(
      expect.arrayContaining(['role.create', 'role.assign', 'role.update_permissions']),
    );
  });

  test('a role manager cannot hand out permissions they do not hold', async () => {
    const admin = await agentFor('admin');
    const deputy = await admin.agent.post('/api/v1/roles').send({
      code: 'deputy',
      name: 'Deputy',
      permissions: ['roles.view', 'roles.manage', 'users.view'],
    });
    await admin.agent
      .post(`/api/v1/users/${t.users.frontOffice.id}/roles`)
      .send({ roleId: deputy.body.id });

    const { agent, session } = await agentFor('frontOffice');
    await agent
      .post('/api/v1/auth/switch-profile')
      .send({ profileKey: session.profiles.find((p) => p.roleCode === 'deputy').key });

    const escalate = await agent
      .post('/api/v1/roles')
      .send({ code: 'cashier', name: 'Cashier', permissions: ['fees.collect'] });
    const grabAdmin = await agent
      .post(`/api/v1/users/${t.users.frontOffice.id}/roles`)
      .send({ roleId: t.roleIds.admin });

    expect(escalate.status).toBe(403);
    expect(escalate.body.error.details.missing).toEqual(['fees.collect']);
    expect(grabAdmin.status).toBe(403);
  });

  test('system role codes are reserved and the admin role cannot be reduced', async () => {
    const admin = await agentFor('admin');

    expect(
      (
        await admin.agent
          .post('/api/v1/roles')
          .send({ code: 'teacher', name: 'Teacher 2', permissions: [] })
      ).status,
    ).toBe(409);
    expect(
      (
        await admin.agent
          .put(`/api/v1/roles/${t.roleIds.admin}/permissions`)
          .send({ permissions: ['users.view'] })
      ).status,
    ).toBe(409);
  });

  test('the last admin cannot lose the admin role', async () => {
    const admin = await agentFor('admin');
    const res = await admin.agent.delete(
      `/api/v1/users/${t.users.admin.id}/roles/${t.roleIds.admin}`,
    );

    expect(res.status).toBe(409);
  });

  test('lists roles and the permission catalog', async () => {
    const admin = await agentFor('admin');

    const roles = await admin.agent.get('/api/v1/roles');
    const permissions = await admin.agent.get('/api/v1/roles/permissions');

    expect(roles.body.data.map((r) => r.code)).toEqual(
      expect.arrayContaining(['admin', 'teacher', 'parent', 'librarian']),
    );
    expect(permissions.body.data.find((p) => p.code === 'fees.collect')).toMatchObject({
      module: 'fees',
    });
  });
});
