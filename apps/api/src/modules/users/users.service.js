const { withTenant } = require('../../lib/prisma');
const { AppError } = require('../../lib/errors');
const { recordAudit } = require('../../lib/audit');
const { toSkipTake, pageResult } = require('../../lib/pagination');
const { hashPassword, generateTemporaryPassword } = require('../../lib/password');
const {
  ADMIN_ROLE,
  permissionCodesForRoles,
  assertWithinOwnPermissions,
} = require('../roles/roles.service');
const { PRIVILEGED_PERMISSIONS } = require('../../config/permissions');

const PRIVILEGED = new Set(PRIVILEGED_PERMISSIONS);

const USER_SELECT = {
  id: true,
  name: true,
  phone: true,
  email: true,
  status: true,
  mustChangePassword: true,
  lockedUntil: true,
  lastLoginAt: true,
  createdAt: true,
  userRoles: { select: { role: { select: { id: true, code: true, name: true } } } },
};

function toUserView(user) {
  const { userRoles, lockedUntil, ...rest } = user;
  return {
    ...rest,
    isLocked: Boolean(lockedUntil && lockedUntil > new Date()),
    roles: userRoles.map((ur) => ur.role),
  };
}

async function findUserOrThrow(tx, instituteId, userId) {
  const user = await tx.user.findFirst({ where: { id: userId, instituteId }, select: USER_SELECT });
  if (!user) throw AppError.notFound('User not found');
  return user;
}

/** Taking over an account must not grant more privileged access than the actor already has. */
async function assertCanManage(tx, ctx, user) {
  const codes = await permissionCodesForRoles(
    tx,
    ctx.instituteId,
    user.userRoles.map((ur) => ur.role.id),
  );
  assertWithinOwnPermissions(
    ctx,
    codes.filter((code) => PRIVILEGED.has(code)),
  );
}

function listUsers(ctx, { page, limit, q, role, status }) {
  return withTenant(ctx.instituteId, async (tx) => {
    const where = {
      instituteId: ctx.instituteId,
      ...(status ? { status } : {}),
      ...(role ? { userRoles: { some: { role: { code: role } } } } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { phone: { contains: q.replace(/\D/g, '') || q } },
            ],
          }
        : {}),
    };
    const users = await tx.user.findMany({
      where,
      orderBy: { name: 'asc' },
      select: USER_SELECT,
      ...toSkipTake({ page, limit }),
    });
    const total = await tx.user.count({ where });
    return pageResult(users.map(toUserView), total, { page, limit });
  });
}

/**
 * Generates a temporary password (returned once, never stored in plain text), forces a change at
 * next login, clears any lockout and signs the user out everywhere.
 */
async function resetPassword(ctx, userId, meta) {
  if (userId === ctx.userId) {
    throw AppError.badRequest('Use "Change password" to change your own password');
  }
  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);

  return withTenant(ctx.instituteId, async (tx) => {
    const user = await findUserOrThrow(tx, ctx.instituteId, userId);
    await assertCanManage(tx, ctx, user);

    const now = new Date();
    await tx.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        mustChangePassword: true,
        passwordChangedAt: now,
        failedAttempts: 0,
        lockedUntil: null,
      },
    });
    const revoked = await tx.refreshToken.updateMany({
      where: { instituteId: ctx.instituteId, userId, revokedAt: null },
      data: { revokedAt: now },
    });
    await recordAudit(tx, {
      instituteId: ctx.instituteId,
      userId: ctx.userId,
      action: 'user.password_reset',
      entity: 'user',
      entityId: userId,
      after: { mustChangePassword: true, sessionsRevoked: revoked.count },
      meta,
    });
    return { userId, temporaryPassword };
  });
}

function assignRole(ctx, userId, roleId, meta) {
  return withTenant(ctx.instituteId, async (tx) => {
    const user = await findUserOrThrow(tx, ctx.instituteId, userId);
    const role = await tx.role.findFirst({
      where: { id: roleId, instituteId: ctx.instituteId },
      select: { id: true, code: true },
    });
    if (!role) throw AppError.notFound('Role not found');
    assertWithinOwnPermissions(ctx, await permissionCodesForRoles(tx, ctx.instituteId, [roleId]));

    if (user.userRoles.some((ur) => ur.role.id === roleId)) {
      throw AppError.conflict('The user already has this role');
    }
    await tx.userRole.create({ data: { instituteId: ctx.instituteId, userId, roleId } });
    await recordAudit(tx, {
      instituteId: ctx.instituteId,
      userId: ctx.userId,
      action: 'role.assign',
      entity: 'user',
      entityId: userId,
      before: { roles: user.userRoles.map((ur) => ur.role.code) },
      after: { added: role.code },
      meta,
    });
    return toUserView(await findUserOrThrow(tx, ctx.instituteId, userId));
  });
}

function removeRole(ctx, userId, roleId, meta) {
  return withTenant(ctx.instituteId, async (tx) => {
    const user = await findUserOrThrow(tx, ctx.instituteId, userId);
    const assigned = user.userRoles.find((ur) => ur.role.id === roleId);
    if (!assigned) throw AppError.notFound('The user does not have this role');
    assertWithinOwnPermissions(ctx, await permissionCodesForRoles(tx, ctx.instituteId, [roleId]));

    if (assigned.role.code === ADMIN_ROLE) {
      const admins = await tx.userRole.count({
        where: { instituteId: ctx.instituteId, roleId, user: { status: 'active' } },
      });
      if (admins <= 1) throw AppError.conflict('An institute must keep at least one admin');
    }

    await tx.userRole.deleteMany({ where: { instituteId: ctx.instituteId, userId, roleId } });
    await recordAudit(tx, {
      instituteId: ctx.instituteId,
      userId: ctx.userId,
      action: 'role.unassign',
      entity: 'user',
      entityId: userId,
      before: { roles: user.userRoles.map((ur) => ur.role.code) },
      after: { removed: assigned.role.code },
      meta,
    });
    return toUserView(await findUserOrThrow(tx, ctx.instituteId, userId));
  });
}

module.exports = { listUsers, resetPassword, assignRole, removeRole };
