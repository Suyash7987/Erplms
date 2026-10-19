const request = require('supertest');
const jwt = require('jsonwebtoken');
const { createApp } = require('../../src/app');
const { prisma, withTenant } = require('../../src/lib/prisma');
const { hashToken } = require('../../src/lib/tokens');
const { CONSENT_VERSION } = require('../../src/config/consent');
const { createAuthTenant, signIn, cookieValue, PASSWORD } = require('../helpers/auth-fixtures');

const app = createApp();
let t;

beforeAll(async () => {
  t = await createAuthTenant('Auth');
});

afterAll(() => prisma.$disconnect());

const inTenant = (work) => withTenant(t.instituteId, work);
const auditActions = async (entityId) =>
  (
    await inTenant((tx) =>
      tx.auditLog.findMany({ where: { entityId }, orderBy: { createdAt: 'asc' } }),
    )
  ).map((row) => row.action);

const refreshWith = (rawToken) =>
  request(app).post('/api/v1/auth/refresh').set('Cookie', `erp_rt=${rawToken}`);

describe('login', () => {
  test('signs in with institute code, phone and password and sets httpOnly cookies', async () => {
    const { res } = await signIn(app, t, 'admin');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      user: { phone: t.users.admin.phone },
      institute: { slug: t.slug, board: 'ICSE' },
      activeProfile: { roleCode: 'admin', type: 'staff' },
      mustChangePassword: false,
      consentPending: false,
    });
    expect(res.body.permissions).toContain('users.reset_password');

    const cookie = (name) => res.headers['set-cookie'].find((c) => c.startsWith(`${name}=`));
    for (const name of ['erp_at', 'erp_rt']) {
      expect(cookie(name)).toMatch(/; HttpOnly/);
      expect(cookie(name)).toMatch(/; SameSite=Strict/);
    }
    expect(cookie('erp_at')).toMatch(/; Path=\/api\/v1;/);
    expect(cookie('erp_at')).toMatch(/Max-Age=900/);
    expect(cookie('erp_rt')).toMatch(/; Path=\/api\/v1\/auth;/);
    expect(JSON.stringify(res.body)).not.toContain(cookieValue(res, 'erp_at'));
    expect(await auditActions(t.users.admin.id)).toContain('auth.login');
  });

  test('accepts the phone with +91, spaces or a leading 0', async () => {
    const phone = t.users.teacher.phone;
    for (const variant of [`+91 ${phone}`, `0${phone}`, `${phone.slice(0, 5)} ${phone.slice(5)}`]) {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ instituteCode: t.slug.toUpperCase(), phone: variant, password: PASSWORD });
      expect(res.status).toBe(200);
    }
  });

  test('gives the same answer for a wrong password, unknown phone or unknown institute', async () => {
    const attempts = [
      { instituteCode: t.slug, phone: t.users.teacher.phone, password: 'Wrong@Pass1' },
      { instituteCode: t.slug, phone: '9999999999', password: PASSWORD },
      { instituteCode: 'no-such-school', phone: t.users.teacher.phone, password: PASSWORD },
    ];
    const bodies = [];
    for (const body of attempts) {
      const res = await request(app).post('/api/v1/auth/login').send(body);
      expect(res.status).toBe(401);
      bodies.push({ code: res.body.error.code, message: res.body.error.message });
    }

    expect(new Set(bodies.map((b) => JSON.stringify(b))).size).toBe(1);
    expect(bodies[0].code).toBe('INVALID_CREDENTIALS');
  });

  test('validates the request body', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ instituteCode: t.slug, phone: '12345' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.map((d) => d.path).sort()).toEqual(['password', 'phone']);
  });

  test('disabled users cannot sign in', async () => {
    const { res } = await signIn(app, t, 'disabled');

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ACCOUNT_DISABLED');
  });
});

describe('lockout', () => {
  test('locks the account after 5 wrong passwords, even for the right password', async () => {
    for (let i = 1; i <= 4; i += 1) {
      expect((await signIn(app, t, 'lockme', 'Wrong@Pass1')).res.status).toBe(401);
    }
    const fifth = (await signIn(app, t, 'lockme', 'Wrong@Pass1')).res;
    const correct = (await signIn(app, t, 'lockme')).res;

    expect(fifth.status).toBe(423);
    expect(fifth.body.error.code).toBe('ACCOUNT_LOCKED');
    expect(fifth.body.error.details.retryAfterSeconds).toBeGreaterThan(800);
    expect(correct.status).toBe(423);
    expect(await auditActions(t.users.lockme.id)).toEqual(
      expect.arrayContaining(['auth.login_failed', 'auth.account_locked']),
    );
  });

  test('unlocks after the lock period and resets the counter', async () => {
    await inTenant((tx) =>
      tx.user.update({
        where: { id: t.users.lockme.id },
        data: { lockedUntil: new Date(Date.now() - 1000) },
      }),
    );

    const { res } = await signIn(app, t, 'lockme');
    const user = await inTenant((tx) => tx.user.findUnique({ where: { id: t.users.lockme.id } }));

    expect(res.status).toBe(200);
    expect(user).toMatchObject({ failedAttempts: 0, lockedUntil: null });
  });
});

describe('forced password change', () => {
  test('a temporary password only allows the onboarding endpoints', async () => {
    const { agent, res } = await signIn(app, t, 'newcomer');

    expect(res.status).toBe(200);
    expect(res.body.mustChangePassword).toBe(true);
    expect((await agent.get('/api/v1/auth/me')).status).toBe(200);

    const blocked = await agent.get('/api/v1/roles');
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');
  });

  test('enforces password rules and checks the current password', async () => {
    const { agent } = await signIn(app, t, 'newcomer');
    const change = (body) => agent.post('/api/v1/auth/change-password').send(body);

    const weak = await change({ currentPassword: PASSWORD, newPassword: 'password' });
    const wrongCurrent = await change({
      currentPassword: 'Nope@1234',
      newPassword: 'Better@Pass2',
    });
    const hasPhone = await change({
      currentPassword: PASSWORD,
      newPassword: `Aa@${t.users.newcomer.phone}`,
    });
    const same = await change({ currentPassword: PASSWORD, newPassword: PASSWORD });

    expect(weak.status).toBe(400);
    expect(weak.body.error.details.map((d) => d.message)).toEqual(
      expect.arrayContaining([
        'Add an uppercase letter',
        'Add a number',
        'Add a symbol such as @ # $ %',
      ]),
    );
    expect(wrongCurrent.body.error.code).toBe('INVALID_CURRENT_PASSWORD');
    expect(hasPhone.status).toBe(400);
    expect(same.status).toBe(400);
  });

  test('changing the password unlocks the app and replaces the old password', async () => {
    const { agent } = await signIn(app, t, 'newcomer');
    const res = await agent
      .post('/api/v1/auth/change-password')
      .send({ currentPassword: PASSWORD, newPassword: 'Better@Pass2' });

    expect(res.status).toBe(200);
    expect(res.body.mustChangePassword).toBe(false);
    // Past onboarding; now the normal permission check applies (teachers cannot view roles).
    expect((await agent.get('/api/v1/roles')).body.error.code).toBe('FORBIDDEN');
    expect((await signIn(app, t, 'newcomer')).res.status).toBe(401);
    expect((await signIn(app, t, 'newcomer', 'Better@Pass2')).res.status).toBe(200);
    expect(await auditActions(t.users.newcomer.id)).toContain('auth.password_change');
  });

  test('changing the password signs out the other devices', async () => {
    const phoneA = await signIn(app, t, 'pwdUser');
    const phoneB = await signIn(app, t, 'pwdUser');
    const oldRefresh = cookieValue(phoneA.res, 'erp_rt');

    await phoneB.agent
      .post('/api/v1/auth/change-password')
      .send({ currentPassword: PASSWORD, newPassword: 'Another@Pass3' });

    const res = await refreshWith(oldRefresh);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('SESSION_EXPIRED');
  });
});

describe('access and refresh tokens', () => {
  test('requests without a valid access token are rejected', async () => {
    const forged = jwt.sign({ iid: t.instituteId }, 'some-other-secret-that-is-long-enough', {
      subject: t.users.admin.id,
    });

    expect((await request(app).get('/api/v1/auth/me')).status).toBe(401);
    expect(
      (await request(app).get('/api/v1/auth/me').set('Cookie', `erp_at=${forged}`)).body.error.code,
    ).toBe('UNAUTHORIZED');
  });

  test('an expired access token says TOKEN_EXPIRED so the client can refresh', async () => {
    const expired = jwt.sign(
      { iid: t.instituteId, rid: t.roleIds.admin, role: 'admin' },
      process.env.JWT_ACCESS_SECRET,
      {
        subject: t.users.admin.id,
        issuer: 'erplms-api',
        audience: 'erplms-access',
        expiresIn: -10,
      },
    );
    const res = await request(app).get('/api/v1/auth/me').set('Cookie', `erp_at=${expired}`);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_EXPIRED');
  });

  test('refresh rotates the refresh token and keeps the session alive', async () => {
    const { res: login } = await signIn(app, t, 'teacher');
    const first = cookieValue(login, 'erp_rt');

    const res = await refreshWith(first);
    const second = cookieValue(res, 'erp_rt');

    expect(res.status).toBe(200);
    expect(second).toBeDefined();
    expect(second).not.toBe(first);
    expect(cookieValue(res, 'erp_at')).toBeDefined();
    expect((await refreshWith(second)).status).toBe(200);
  });

  test('reusing a rotated refresh token revokes the whole session family', async () => {
    const { res: login } = await signIn(app, t, 'teacher');
    const stolen = cookieValue(login, 'erp_rt');
    const current = cookieValue(await refreshWith(stolen), 'erp_rt');
    // Move the rotation out of the parallel-tab grace window.
    await inTenant((tx) =>
      tx.refreshToken.update({
        where: { tokenHash: hashToken(stolen) },
        data: { revokedAt: new Date(Date.now() - 60_000) },
      }),
    );

    const replay = await refreshWith(stolen);
    const victim = await refreshWith(current);

    expect(replay.status).toBe(401);
    expect(victim.status).toBe(401);
    expect(await auditActions(t.users.teacher.id)).toContain('auth.refresh_reuse_detected');
  });

  test('two tabs refreshing at once: one wins, the other is told to retry', async () => {
    const { res: login } = await signIn(app, t, 'teacher');
    const token = cookieValue(login, 'erp_rt');

    const results = await Promise.all([refreshWith(token), refreshWith(token)]);
    const statuses = results.map((r) => r.status).sort();
    const winner = results.find((r) => r.status === 200);
    const loser = results.find((r) => r.status === 401);

    expect(statuses).toEqual([200, 401]);
    expect(loser.body.error.code).toBe('SESSION_REFRESHED');
    expect((await refreshWith(cookieValue(winner, 'erp_rt'))).status).toBe(200);
  });

  test('logout clears the cookies and revokes the refresh token', async () => {
    const { agent, res: login } = await signIn(app, t, 'teacher');
    const token = cookieValue(login, 'erp_rt');

    const res = await agent.post('/api/v1/auth/logout');

    expect(res.status).toBe(204);
    expect(res.headers['set-cookie'].join('\n')).toMatch(/erp_at=;.*Expires=Thu, 01 Jan 1970/);
    expect((await refreshWith(token)).status).toBe(401);
    expect((await agent.get('/api/v1/auth/me')).status).toBe(401);
  });
});

describe('profiles and parental consent', () => {
  test('a teacher who is also a parent gets both profiles; staff comes first', async () => {
    const { res } = await signIn(app, t, 'teacherParent');

    expect(res.body.profiles.map((p) => [p.roleCode, p.type, p.id])).toEqual([
      ['teacher', 'staff', expect.any(String)],
      ['parent', 'student', t.students.child3],
    ]);
    expect(res.body.activeProfile.roleCode).toBe('teacher');
  });

  test('a parent of siblings gets one profile per child', async () => {
    const { res } = await signIn(app, t, 'parent');

    expect(res.body.profiles.map((p) => p.id).sort()).toEqual(
      [t.students.child1, t.students.child2].sort(),
    );
    expect(res.body.profiles[0]).toMatchObject({ roleCode: 'parent', detail: 'Class 3 - A' });
  });

  test('switching to the parent profile requires consent, which is recorded once', async () => {
    const { agent, res: login } = await signIn(app, t, 'teacherParent');
    const parentProfile = login.body.profiles.find((p) => p.roleCode === 'parent');

    const switched = await agent
      .post('/api/v1/auth/switch-profile')
      .send({ profileKey: parentProfile.key });
    expect(switched.status).toBe(200);
    expect(switched.body).toMatchObject({
      activeProfile: { roleCode: 'parent', id: t.students.child3 },
      consentPending: true,
    });
    expect((await agent.get('/api/v1/roles')).body.error.code).toBe('CONSENT_REQUIRED');

    const pending = await agent.get('/api/v1/auth/consent');
    expect(pending.body.pendingStudents.map((s) => s.id)).toEqual([t.students.child3]);

    const outdated = await agent
      .post('/api/v1/auth/consent')
      .send({ version: 'old', accept: true });
    expect(outdated.status).toBe(409);

    const granted = await agent
      .post('/api/v1/auth/consent')
      .send({ version: CONSENT_VERSION, accept: true });
    expect(granted.status).toBe(200);
    expect(granted.body.consentPending).toBe(false);

    const consents = await inTenant((tx) =>
      tx.consent.findMany({ where: { studentId: t.students.child3 } }),
    );
    expect(consents).toHaveLength(1);
    expect(consents[0]).toMatchObject({ version: CONSENT_VERSION, withdrawnAt: null });

    // Consent is remembered on the next login.
    const again = await signIn(app, t, 'teacherParent');
    const parentAgain = await again.agent
      .post('/api/v1/auth/switch-profile')
      .send({ profileKey: parentProfile.key });
    expect(parentAgain.body.consentPending).toBe(false);
  });

  test('the active profile survives a token refresh', async () => {
    const { agent, res: login } = await signIn(app, t, 'teacherParent');
    const parentProfile = login.body.profiles.find((p) => p.roleCode === 'parent');
    const switched = await agent
      .post('/api/v1/auth/switch-profile')
      .send({ profileKey: parentProfile.key });

    const refreshed = await refreshWith(cookieValue(switched, 'erp_rt'));

    expect(refreshed.body.activeProfile.key).toBe(parentProfile.key);
  });

  test('users cannot switch to a profile that is not theirs', async () => {
    const { agent } = await signIn(app, t, 'teacher');
    const res = await agent
      .post('/api/v1/auth/switch-profile')
      .send({ profileKey: `${t.roleIds.admin}:` });

    expect(res.status).toBe(400);
  });
});
