const { prisma, withTenant } = require('../../lib/prisma');
const { AppError } = require('../../lib/errors');
const { recordAudit } = require('../../lib/audit');
const { toSkipTake, pageResult } = require('../../lib/pagination');
const { PERMISSIONS, SYSTEM_ROLES } = require('../../config/permissions');

const ADMIN_ROLE = 'admin';
const SYSTEM_ROLE_CODES = new Set(SYSTEM_ROLES.map((role) => role.code));

/** Upserts the global permission catalog. Returns { [code]: id }. */
async function syncPermissionCatalog() {
  const ids = {};
  for (const permission of PERMISSIONS) {
    const row = await prisma.permission.upsert({
      where: { code: permission.code },
      update: { module: permission.module, description: permission.description },
      create: permission,
      select: { id: true },
    });
    ids[permission.code] = row.id;
  }
  return ids;
}

/**
 * Creates any missing system roles for an institute with their default permissions, and keeps the
 * admin role at full access. Existing non-admin roles are left alone so institute edits survive.
 * Returns { [roleCode]: roleId }.
 */
async function syncSystemRoles(tx, instituteId, permissionIds) {
  const roleIds = {};
  for (const role of SYSTEM_ROLES) {
    const existing = await tx.role.findUnique({
      where: { instituteId_code: { instituteId, code: role.code } },
      select: { id: true },
    });
    const roleId =
      existing?.id ??
      (
        await tx.role.create({
          data: {
            instituteId,
            code: role.code,
            name: role.name,
            description: role.description,
            isSystem: true,
          },
          select: { id: true },
        })
      ).id;
    roleIds[role.code] = roleId;

    if (!existing || role.code === ADMIN_ROLE) {
      await tx.rolePermission.createMany({
        data: role.permissions.map((code) => ({
          instituteId,
          roleId,
          permissionId: permissionIds[code],
        })),
        skipDuplicates: true,
      });
    }
  }
  return roleIds;
}

/** Permission codes granted by the given roles. */
async function permissionCodesForRoles(tx, instituteId, roleIds) {
  const rows = await tx.rolePermission.findMany({
    where: { instituteId, roleId: { in: roleIds } },
    select: { permission: { select: { code: true } } },
  });
  return [...new Set(rows.map((row) => row.permission.code))];
}

/** Nobody can grant (or take over) access they do not have themselves. */
function assertWithinOwnPermissions(ctx, codes) {
  const missing = codes.filter((code) => !ctx.permissions.has(code));
  if (missing.length) {
    throw new AppError(403, 'FORBIDDEN', 'You cannot grant or manage permissions you do not have', {
      missing,
    });
  }
}

async function resolvePermissionIds(tx, codes) {
  const rows = await tx.permission.findMany({
    where: { code: { in: codes } },
    select: { id: true, code: true },
  });
  const unknown = codes.filter((code) => !rows.some((row) => row.code === code));
  if (unknown.length) {
    throw AppError.badRequest('Unknown permission codes', { unknown });
  }
  return rows;
}

function toRoleView(role) {
  return {
    id: role.id,
    code: role.code,
    name: role.name,
    description: role.description,
    isSystem: role.isSystem,
    permissions: role.rolePermissions.map((rp) => rp.permission.code).sort(),
    userCount: role._count?.userRoles ?? undefined,
  };
}

const ROLE_SELECT = {
  id: true,
  code: true,
  name: true,
  description: true,
  isSystem: true,
  rolePermissions: { select: { permission: { select: { code: true } } } },
  _count: { select: { userRoles: true } },
};

function listPermissions() {
  return prisma.permission.findMany({
    orderBy: [{ module: 'asc' }, { code: 'asc' }],
    select: { code: true, module: true, description: true },
  });
}

function listRoles(ctx, query) {
  return withTenant(ctx.instituteId, async (tx) => {
    const where = { instituteId: ctx.instituteId };
    const roles = await tx.role.findMany({
      where,
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
      select: ROLE_SELECT,
      ...toSkipTake(query),
    });
    const total = await tx.role.count({ where });
    return pageResult(roles.map(toRoleView), total, query);
  });
}

function createRole(ctx, { code, name, description, permissions }, meta) {
  if (SYSTEM_ROLE_CODES.has(code)) {
    throw AppError.conflict('This code is reserved for a system role');
  }
  assertWithinOwnPermissions(ctx, permissions);

  return withTenant(ctx.instituteId, async (tx) => {
    const permissionRows = await resolvePermissionIds(tx, permissions);
    const role = await tx.role.create({
      data: { instituteId: ctx.instituteId, code, name, description, isSystem: false },
      select: { id: true },
    });
    await tx.rolePermission.createMany({
      data: permissionRows.map((p) => ({
        instituteId: ctx.instituteId,
        roleId: role.id,
        permissionId: p.id,
      })),
    });
    const view = toRoleView(
      await tx.role.findUnique({ where: { id: role.id }, select: ROLE_SELECT }),
    );
    await recordAudit(tx, {
      instituteId: ctx.instituteId,
      userId: ctx.userId,
      action: 'role.create',
      entity: 'role',
      entityId: role.id,
      after: { code, name, permissions: view.permissions },
      meta,
    });
    return view;
  });
}

function updateRolePermissions(ctx, roleId, permissions, meta) {
  return withTenant(ctx.instituteId, async (tx) => {
    const role = await tx.role.findFirst({
      where: { id: roleId, instituteId: ctx.instituteId },
      select: ROLE_SELECT,
    });
    if (!role) throw AppError.notFound('Role not found');
    if (role.code === ADMIN_ROLE) {
      throw AppError.conflict('The admin role always has every permission');
    }

    const before = toRoleView(role).permissions;
    assertWithinOwnPermissions(ctx, [...before, ...permissions]);
    const permissionRows = await resolvePermissionIds(tx, permissions);

    await tx.rolePermission.deleteMany({ where: { instituteId: ctx.instituteId, roleId } });
    await tx.rolePermission.createMany({
      data: permissionRows.map((p) => ({
        instituteId: ctx.instituteId,
        roleId,
        permissionId: p.id,
      })),
    });

    const view = toRoleView(
      await tx.role.findUnique({ where: { id: roleId }, select: ROLE_SELECT }),
    );
    await recordAudit(tx, {
      instituteId: ctx.instituteId,
      userId: ctx.userId,
      action: 'role.update_permissions',
      entity: 'role',
      entityId: roleId,
      before: { permissions: before },
      after: { permissions: view.permissions },
      meta,
    });
    return view;
  });
}

module.exports = {
  ADMIN_ROLE,
  syncPermissionCatalog,
  syncSystemRoles,
  permissionCodesForRoles,
  assertWithinOwnPermissions,
  listPermissions,
  listRoles,
  createRole,
  updateRolePermissions,
};
