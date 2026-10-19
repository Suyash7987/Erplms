const { randomUUID } = require('node:crypto');
const { AppError } = require('../../lib/errors');
const { PRIVILEGED_PERMISSIONS } = require('../../config/permissions');

/**
 * Helpers for creating people (students, guardians, staff) and their logins in bulk inside one
 * tenant transaction. Rows get their ids up front and are written with createMany in chunks, so a
 * 2,000-row import is a handful of queries instead of thousands.
 */

const CHUNK_SIZE = 500;

function createBatch(instituteId) {
  return {
    instituteId,
    users: [],
    userRoles: [],
    guardians: [],
    guardianLogins: [],
    staff: [],
    students: [],
    enrollments: [],
    studentGuardians: [],
    credentials: [],
  };
}

async function insertInChunks(delegate, rows, options = {}) {
  for (let start = 0; start < rows.length; start += CHUNK_SIZE) {
    await delegate.createMany({ data: rows.slice(start, start + CHUNK_SIZE), ...options });
  }
}

/** Writes everything planned in the batch, in foreign-key order. */
async function flushBatch(tx, batch) {
  await insertInChunks(tx.user, batch.users);
  await insertInChunks(tx.userRole, batch.userRoles, { skipDuplicates: true });
  await insertInChunks(tx.guardian, batch.guardians);
  for (const { guardianId, userId } of batch.guardianLogins) {
    await tx.guardian.update({ where: { id: guardianId }, data: { userId } });
  }
  await insertInChunks(tx.staff, batch.staff);
  await insertInChunks(tx.student, batch.students);
  await insertInChunks(tx.studentEnrollment, batch.enrollments);
  await insertInChunks(tx.studentGuardian, batch.studentGuardians, { skipDuplicates: true });
}

/** Existing users keyed by phone, with what they are already linked to. */
async function loadUsersByPhone(tx, instituteId, phones) {
  const users = await tx.user.findMany({
    where: { instituteId, phone: { in: [...new Set(phones)] } },
    select: {
      id: true,
      phone: true,
      name: true,
      student: { select: { id: true } },
      staff: { select: { id: true } },
      guardian: { select: { id: true } },
      userRoles: { select: { roleId: true } },
    },
  });
  return new Map(
    users.map((user) => [
      user.phone,
      {
        id: user.id,
        phone: user.phone,
        name: user.name,
        studentId: user.student?.id ?? null,
        staffId: user.staff?.id ?? null,
        guardianId: user.guardian?.id ?? null,
        roleIds: new Set(user.userRoles.map((ur) => ur.roleId)),
      },
    ]),
  );
}

/** Existing guardians keyed by phone (the phone is how siblings are linked). */
async function loadGuardiansByPhone(tx, instituteId, phones) {
  const guardians = await tx.guardian.findMany({
    where: { instituteId, phone: { in: [...new Set(phones)] } },
    orderBy: { createdAt: 'asc' },
    select: { id: true, phone: true, name: true, userId: true },
  });
  const map = new Map();
  for (const guardian of guardians) {
    if (!map.has(guardian.phone)) map.set(guardian.phone, { ...guardian, isNew: false });
  }
  return map;
}

/** Role records by code, with their permission codes. Throws if a code does not exist. */
async function loadRoles(tx, instituteId, codes) {
  const roles = await tx.role.findMany({
    where: { instituteId, code: { in: [...new Set(codes)] } },
    select: {
      id: true,
      code: true,
      rolePermissions: { select: { permission: { select: { code: true } } } },
    },
  });
  const map = new Map(
    roles.map((role) => [
      role.code,
      {
        id: role.id,
        code: role.code,
        permissions: role.rolePermissions.map((rp) => rp.permission.code),
      },
    ]),
  );
  const missing = codes.filter((code) => !map.has(code));
  if (missing.length) throw AppError.badRequest(`Unknown role: ${missing.join(', ')}`);
  return map;
}

const PRIVILEGED = new Set(PRIVILEGED_PERMISSIONS);

/**
 * Parent and student logins only see their own family's records, so anyone allowed to add
 * students may create them. If an institute has given those roles privileged permissions, the
 * actor must hold them too.
 */
function assertCanGrantFamilyRole(ctx, role) {
  const missing = role.permissions.filter(
    (code) => PRIVILEGED.has(code) && !ctx.permissions.has(code),
  );
  if (missing.length) {
    throw new AppError(
      403,
      'FORBIDDEN',
      `You cannot create ${role.code} logins with this role setup`,
      {
        missing,
      },
    );
  }
}

/** Hands out pre-hashed temporary passwords (see createTemporaryCredentials). */
function credentialSource(pool) {
  return () => {
    const credential = pool.shift();
    if (!credential) throw AppError.conflict('The data changed while saving. Please try again.');
    return credential;
  };
}

/**
 * Returns the user id for `phone`, creating a login with a temporary password when none exists,
 * and gives the user `role`. Existing users keep their password (e.g. a teacher who is also a
 * parent simply gains the parent role).
 */
function ensureAccount(batch, { phone, name, role, users, takeCredential }) {
  const existing = users.get(phone);
  if (existing) {
    if (!existing.roleIds.has(role.id)) {
      batch.userRoles.push({
        instituteId: batch.instituteId,
        userId: existing.id,
        roleId: role.id,
      });
      existing.roleIds.add(role.id);
    }
    return { userId: existing.id, created: false };
  }

  const credential = takeCredential();
  const id = randomUUID();
  batch.users.push({
    id,
    instituteId: batch.instituteId,
    phone,
    name,
    passwordHash: credential.hash,
    mustChangePassword: true,
  });
  batch.userRoles.push({ instituteId: batch.instituteId, userId: id, roleId: role.id });
  users.set(phone, {
    id,
    phone,
    name,
    studentId: null,
    staffId: null,
    guardianId: null,
    roleIds: new Set([role.id]),
  });
  batch.credentials.push({ name, phone, role: role.code, temporaryPassword: credential.plain });
  return { userId: id, created: true };
}

/** How many of these phones have no login yet (each needs a temporary password). */
async function countPhonesWithoutLogin(tx, instituteId, phones) {
  const unique = [...new Set(phones)];
  if (!unique.length) return 0;
  const existing = await tx.user.count({ where: { instituteId, phone: { in: unique } } });
  return unique.length - existing;
}

module.exports = {
  createBatch,
  flushBatch,
  loadUsersByPhone,
  loadGuardiansByPhone,
  loadRoles,
  assertCanGrantFamilyRole,
  credentialSource,
  ensureAccount,
  countPhonesWithoutLogin,
};
