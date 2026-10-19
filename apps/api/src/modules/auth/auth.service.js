const { randomUUID } = require('node:crypto');
const { env } = require('../../config/env');
const { CONSENT_PURPOSE, CONSENT_VERSION } = require('../../config/consent');
const { withTenant, withPlatform } = require('../../lib/prisma');
const { AppError, ERROR_CODES } = require('../../lib/errors');
const { recordAudit } = require('../../lib/audit');
const { hashPassword, verifyPassword } = require('../../lib/password');
const {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashToken,
} = require('../../lib/tokens');
const { listProfiles, studentsAwaitingConsent, isConsentPending } = require('./profiles.service');

const LOCK_MS = env.LOGIN_LOCK_MINUTES * 60_000;
// A rotated token presented again within this window is a parallel refresh (two tabs), not theft.
const REFRESH_RACE_GRACE_MS = 10_000;

const invalidCredentials = () =>
  new AppError(
    401,
    ERROR_CODES.INVALID_CREDENTIALS,
    'Invalid institute code, phone number or password',
  );

const sessionExpired = () =>
  AppError.unauthorized('Please sign in again', ERROR_CODES.SESSION_EXPIRED);

function accountLocked(lockedUntil) {
  const retryAfterSeconds = Math.max(1, Math.ceil((lockedUntil.getTime() - Date.now()) / 1000));
  return new AppError(
    423,
    ERROR_CODES.ACCOUNT_LOCKED,
    `Too many wrong passwords. Try again in ${Math.ceil(retryAfterSeconds / 60)} minute(s), or ask the school office to reset your password.`,
    { retryAfterSeconds, lockedUntil: lockedUntil.toISOString() },
  );
}

// Unknown institute/phone still pays the bcrypt cost so response times do not reveal which exist.
let timingHash;
async function spendPasswordCheck(password) {
  timingHash ??= await hashPassword(randomUUID());
  await verifyPassword(password, timingHash);
}

// ---------------------------------------------------------------------------
// Tokens and session view
// ---------------------------------------------------------------------------

async function issueTokens(tx, { instituteId, userId, profile, consentPending, familyId, meta }) {
  const accessToken = signAccessToken({ userId, instituteId, profile, consentPending });
  const family = familyId ?? randomUUID();
  const { token: refreshToken, expiresAt } = signRefreshToken({
    userId,
    instituteId,
    familyId: family,
    profileKey: profile.key,
  });
  const row = await tx.refreshToken.create({
    data: {
      instituteId,
      userId,
      tokenHash: hashToken(refreshToken),
      familyId: family,
      expiresAt,
      createdByIp: meta?.ip ?? null,
      userAgent: meta?.userAgent ?? null,
    },
    select: { id: true },
  });
  return { accessToken, refreshToken, refreshExpiresAt: expiresAt, refreshTokenId: row.id };
}

/** Everything the web app needs to render the signed-in shell. */
async function buildSessionView(tx, { instituteId, userId, profile, profiles, consentPending }) {
  const user = await tx.user.findFirst({
    where: { id: userId, instituteId },
    select: {
      id: true,
      name: true,
      phone: true,
      mustChangePassword: true,
      institute: {
        select: {
          id: true,
          name: true,
          slug: true,
          board: true,
          boardName: true,
          settings: true,
          enabledModules: true,
        },
      },
    },
  });
  const permissions = await tx.rolePermission.findMany({
    where: { instituteId, roleId: profile.roleId },
    select: { permission: { select: { code: true } } },
  });
  const { settings, ...institute } = user.institute;

  return {
    user: { id: user.id, name: user.name, phone: user.phone },
    institute: { ...institute, labels: settings?.labels ?? {} },
    activeProfile: profile,
    profiles,
    permissions: permissions.map((row) => row.permission.code).sort(),
    mustChangePassword: user.mustChangePassword,
    consentPending,
  };
}

async function startSession(tx, { instituteId, userId, profile, profiles, familyId, meta }) {
  const consentPending = await isConsentPending(tx, { instituteId, userId, profile });
  const tokens = await issueTokens(tx, {
    instituteId,
    userId,
    profile,
    consentPending,
    familyId,
    meta,
  });
  const session = await buildSessionView(tx, {
    instituteId,
    userId,
    profile,
    profiles,
    consentPending,
  });
  return { tokens, session };
}

/** Revokes the presented refresh token (if valid) and returns its family so the session continues. */
async function retireRefreshToken(tx, { instituteId, userId, rawRefreshToken, replacedById }) {
  if (!rawRefreshToken) return null;
  const stored = await tx.refreshToken.findUnique({
    where: { tokenHash: hashToken(rawRefreshToken) },
    select: { id: true, userId: true, familyId: true, revokedAt: true },
  });
  if (!stored || stored.userId !== userId || stored.revokedAt) return null;
  await tx.refreshToken.updateMany({
    where: { id: stored.id, instituteId, revokedAt: null },
    data: { revokedAt: new Date(), replacedById: replacedById ?? null },
  });
  return stored.familyId;
}

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

/** Counts a wrong password; locks the account after LOGIN_MAX_ATTEMPTS. Returns lockedUntil or null. */
async function registerFailedLogin(tx, { instituteId, userId, meta }) {
  const { failedAttempts } = await tx.user.update({
    where: { id: userId },
    data: { failedAttempts: { increment: 1 } },
    select: { failedAttempts: true },
  });

  let lockedUntil = null;
  if (failedAttempts >= env.LOGIN_MAX_ATTEMPTS) {
    lockedUntil = new Date(Date.now() + LOCK_MS);
    await tx.user.update({ where: { id: userId }, data: { lockedUntil, failedAttempts: 0 } });
  }

  await recordAudit(tx, {
    instituteId,
    userId: null,
    action: lockedUntil ? 'auth.account_locked' : 'auth.login_failed',
    entity: 'user',
    entityId: userId,
    after: { failedAttempts, lockedUntil },
    meta,
  });
  return lockedUntil;
}

/**
 * Phone + password login for one institute. Password verification lives here so other methods
 * (OTP, SSO) can be added later and end in the same startSession().
 */
async function login({ instituteCode, phone, password }, meta) {
  const institute = await withPlatform((tx) =>
    tx.institute.findUnique({ where: { slug: instituteCode }, select: { id: true, status: true } }),
  );
  if (!institute || institute.status !== 'active') {
    await spendPasswordCheck(password);
    throw invalidCredentials();
  }
  const instituteId = institute.id;

  const user = await withTenant(instituteId, (tx) =>
    tx.user.findUnique({
      where: { instituteId_phone: { instituteId, phone } },
      select: { id: true, passwordHash: true, status: true, lockedUntil: true },
    }),
  );
  if (!user) {
    await spendPasswordCheck(password);
    throw invalidCredentials();
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw accountLocked(user.lockedUntil);
  }

  // bcrypt runs outside any transaction so a slow hash never holds a database connection.
  const passwordOk = await verifyPassword(password, user.passwordHash);
  if (!passwordOk) {
    const lockedUntil = await withTenant(instituteId, (tx) =>
      registerFailedLogin(tx, { instituteId, userId: user.id, meta }),
    );
    throw lockedUntil ? accountLocked(lockedUntil) : invalidCredentials();
  }
  if (user.status !== 'active') {
    throw new AppError(
      403,
      ERROR_CODES.ACCOUNT_DISABLED,
      'This account is disabled. Please contact the school office.',
    );
  }

  return withTenant(instituteId, async (tx) => {
    const profiles = await listProfiles(tx, { instituteId, userId: user.id });
    if (!profiles.length) {
      throw AppError.forbidden(
        'This account has no active role. Please contact the school office.',
      );
    }

    await tx.user.update({
      where: { id: user.id },
      data: { failedAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
    });
    const result = await startSession(tx, {
      instituteId,
      userId: user.id,
      profile: profiles[0],
      profiles,
      meta,
    });
    await recordAudit(tx, {
      instituteId,
      userId: user.id,
      action: 'auth.login',
      entity: 'user',
      entityId: user.id,
      after: { role: profiles[0].roleCode },
      meta,
    });
    return result;
  });
}

// ---------------------------------------------------------------------------
// Refresh (rotation with reuse detection) and logout
// ---------------------------------------------------------------------------

async function refresh(rawRefreshToken, meta) {
  if (!rawRefreshToken) throw sessionExpired();
  const claims = verifyRefreshToken(rawRefreshToken);
  const instituteId = claims.iid;
  const userId = claims.sub;

  const outcome = await withTenant(instituteId, async (tx) => {
    const now = new Date();
    const stored = await tx.refreshToken.findUnique({
      where: { tokenHash: hashToken(rawRefreshToken) },
    });
    if (!stored || stored.userId !== userId || stored.expiresAt <= now) {
      return { error: 'expired' };
    }

    if (stored.revokedAt) {
      const recentlyRotated =
        stored.replacedById && now.getTime() - stored.revokedAt.getTime() < REFRESH_RACE_GRACE_MS;
      if (recentlyRotated) return { error: 'race' };

      // A rotated token came back: assume it was stolen and end every session in its family.
      await tx.refreshToken.updateMany({
        where: { instituteId, familyId: stored.familyId, revokedAt: null },
        data: { revokedAt: now },
      });
      await recordAudit(tx, {
        instituteId,
        userId,
        action: 'auth.refresh_reuse_detected',
        entity: 'user',
        entityId: userId,
        after: { familyId: stored.familyId },
        meta,
      });
      return { error: 'reused' };
    }

    // Claim the token atomically; a parallel refresh that loses the race gets count 0.
    const claimed = await tx.refreshToken.updateMany({
      where: { id: stored.id, revokedAt: null },
      data: { revokedAt: now },
    });
    if (claimed.count === 0) return { error: 'race' };

    const user = await tx.user.findFirst({
      where: { id: userId, instituteId },
      select: { status: true },
    });
    if (user?.status !== 'active') return { error: 'expired' };

    const profiles = await listProfiles(tx, { instituteId, userId });
    if (!profiles.length) return { error: 'expired' };
    const profile = profiles.find((p) => p.key === claims.pk) ?? profiles[0];

    const result = await startSession(tx, {
      instituteId,
      userId,
      profile,
      profiles,
      familyId: stored.familyId,
      meta,
    });
    await tx.refreshToken.update({
      where: { id: stored.id },
      data: { replacedById: result.tokens.refreshTokenId },
    });
    return result;
  });

  if (outcome.error === 'race') {
    throw AppError.unauthorized(
      'Session was refreshed by another tab; retry the request',
      ERROR_CODES.SESSION_REFRESHED,
    );
  }
  if (outcome.error) throw sessionExpired();
  return outcome;
}

/** Ends this device's session (its whole refresh-token family). Never fails. */
async function logout(rawRefreshToken, meta) {
  if (!rawRefreshToken) return;
  let claims;
  try {
    claims = verifyRefreshToken(rawRefreshToken);
  } catch {
    return;
  }
  await withTenant(claims.iid, async (tx) => {
    const stored = await tx.refreshToken.findUnique({
      where: { tokenHash: hashToken(rawRefreshToken) },
      select: { familyId: true, userId: true },
    });
    if (!stored || stored.userId !== claims.sub) return;
    await tx.refreshToken.updateMany({
      where: { instituteId: claims.iid, familyId: stored.familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await recordAudit(tx, {
      instituteId: claims.iid,
      userId: claims.sub,
      action: 'auth.logout',
      entity: 'user',
      entityId: claims.sub,
      meta,
    });
  });
}

// ---------------------------------------------------------------------------
// Signed-in actions
// ---------------------------------------------------------------------------

function activeProfileFrom(ctx, profiles) {
  return (
    profiles.find((p) => p.roleId === ctx.roleId && (p.id ?? null) === ctx.profile.id) ??
    profiles[0]
  );
}

function getSession(ctx) {
  return withTenant(ctx.instituteId, async (tx) => {
    const profiles = await listProfiles(tx, ctx);
    const profile = activeProfileFrom(ctx, profiles);
    return buildSessionView(tx, {
      instituteId: ctx.instituteId,
      userId: ctx.userId,
      profile,
      profiles,
      consentPending: ctx.consentPending,
    });
  });
}

async function changePassword(ctx, { currentPassword, newPassword }, meta) {
  const user = await withTenant(ctx.instituteId, (tx) =>
    tx.user.findFirst({
      where: { id: ctx.userId, instituteId: ctx.instituteId },
      select: { passwordHash: true, phone: true },
    }),
  );
  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    throw new AppError(
      400,
      ERROR_CODES.INVALID_CURRENT_PASSWORD,
      'Your current password is not correct',
    );
  }
  if (newPassword.includes(user.phone)) {
    throw AppError.badRequest('Password must not contain your phone number', [
      {
        location: 'body',
        path: 'newPassword',
        code: 'contains_phone',
        message: 'Must not contain your phone number',
      },
    ]);
  }
  if (await verifyPassword(newPassword, user.passwordHash)) {
    throw AppError.badRequest('New password must be different from the current one', [
      {
        location: 'body',
        path: 'newPassword',
        code: 'same_as_current',
        message: 'Must differ from the current password',
      },
    ]);
  }
  const passwordHash = await hashPassword(newPassword);

  return withTenant(ctx.instituteId, async (tx) => {
    await tx.user.update({
      where: { id: ctx.userId },
      data: { passwordHash, mustChangePassword: false, passwordChangedAt: new Date() },
    });
    // Sign out every other device; this one gets a fresh session below.
    await tx.refreshToken.updateMany({
      where: { instituteId: ctx.instituteId, userId: ctx.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await recordAudit(tx, {
      instituteId: ctx.instituteId,
      userId: ctx.userId,
      action: 'auth.password_change',
      entity: 'user',
      entityId: ctx.userId,
      meta,
    });

    const profiles = await listProfiles(tx, ctx);
    const result = await startSession(tx, {
      instituteId: ctx.instituteId,
      userId: ctx.userId,
      profile: activeProfileFrom(ctx, profiles),
      profiles,
      meta,
    });
    return result;
  });
}

function switchProfile(ctx, profileKey, rawRefreshToken, meta) {
  if (!rawRefreshToken) throw sessionExpired();
  return withTenant(ctx.instituteId, async (tx) => {
    const profiles = await listProfiles(tx, ctx);
    const profile = profiles.find((p) => p.key === profileKey);
    if (!profile) throw AppError.badRequest('This profile is not available to you');

    const familyId = await retireRefreshToken(tx, {
      instituteId: ctx.instituteId,
      userId: ctx.userId,
      rawRefreshToken,
    });
    if (!familyId) throw sessionExpired();

    return startSession(tx, {
      instituteId: ctx.instituteId,
      userId: ctx.userId,
      profile,
      profiles,
      familyId,
      meta,
    });
  });
}

// ---------------------------------------------------------------------------
// DPDP parental consent
// ---------------------------------------------------------------------------

function assertParent(ctx) {
  if (ctx.roleCode !== 'parent') {
    throw AppError.forbidden('Consent is given from a parent profile');
  }
}

function getConsent(ctx) {
  assertParent(ctx);
  return withTenant(ctx.instituteId, async (tx) => {
    const { students } = await studentsAwaitingConsent(tx, ctx);
    return { purpose: CONSENT_PURPOSE, version: CONSENT_VERSION, pendingStudents: students };
  });
}

function grantConsent(ctx, { version }, meta) {
  assertParent(ctx);
  if (version !== CONSENT_VERSION) {
    throw AppError.conflict('The consent text has changed. Please review it again.', {
      currentVersion: CONSENT_VERSION,
    });
  }

  return withTenant(ctx.instituteId, async (tx) => {
    const { guardianId, students } = await studentsAwaitingConsent(tx, ctx);
    if (guardianId && students.length) {
      const grantedAt = new Date();
      await tx.consent.createMany({
        data: students.map((student) => ({
          instituteId: ctx.instituteId,
          guardianId,
          studentId: student.id,
          purpose: CONSENT_PURPOSE,
          version: CONSENT_VERSION,
          grantedAt,
          grantedByUserId: ctx.userId,
          ip: meta?.ip ?? null,
        })),
        skipDuplicates: true,
      });
      await recordAudit(tx, {
        instituteId: ctx.instituteId,
        userId: ctx.userId,
        action: 'consent.grant',
        entity: 'guardian',
        entityId: guardianId,
        after: {
          purpose: CONSENT_PURPOSE,
          version: CONSENT_VERSION,
          studentIds: students.map((s) => s.id),
        },
        meta,
      });
    }

    const profiles = await listProfiles(tx, ctx);
    const profile = activeProfileFrom(ctx, profiles);
    const consentPending = await isConsentPending(tx, {
      instituteId: ctx.instituteId,
      userId: ctx.userId,
      profile,
    });
    const accessToken = signAccessToken({
      userId: ctx.userId,
      instituteId: ctx.instituteId,
      profile,
      consentPending,
    });
    const session = await buildSessionView(tx, {
      instituteId: ctx.instituteId,
      userId: ctx.userId,
      profile,
      profiles,
      consentPending,
    });
    return { accessToken, session };
  });
}

module.exports = {
  login,
  refresh,
  logout,
  getSession,
  changePassword,
  switchProfile,
  getConsent,
  grantConsent,
};
