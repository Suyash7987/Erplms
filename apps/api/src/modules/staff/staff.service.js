const { randomUUID } = require('node:crypto');
const { withTenant } = require('../../lib/prisma');
const { AppError } = require('../../lib/errors');
const { recordAudit } = require('../../lib/audit');
const { toSkipTake, pageResult } = require('../../lib/pagination');
const { formatDateOnly } = require('../../lib/dates');
const { createTemporaryCredentials } = require('../../lib/password');
const accounts = require('../users/accounts.service');
const { assertWithinOwnPermissions } = require('../roles/roles.service');

const FAMILY_ROLES = new Set(['parent', 'student']);

const STAFF_SUMMARY = {
  id: true,
  name: true,
  employeeCode: true,
  phone: true,
  designation: true,
  department: true,
  staffType: true,
  status: true,
  userId: true,
};

const toSummary = ({ userId, ...staff }) => ({ ...staff, hasLogin: Boolean(userId) });

/** Staff directory with search and filters (also feeds the teacher pickers). */
function listStaff(ctx, { page, limit, q, staffType, status }) {
  return withTenant(ctx.instituteId, async (tx) => {
    const where = {
      instituteId: ctx.instituteId,
      ...(status === 'all' ? {} : { status }),
      ...(staffType ? { staffType } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { employeeCode: { contains: q, mode: 'insensitive' } },
              { phone: { contains: q } },
            ],
          }
        : {}),
    };
    const staff = await tx.staff.findMany({
      where,
      orderBy: { name: 'asc' },
      select: STAFF_SUMMARY,
      ...toSkipTake({ page, limit }),
    });
    const total = await tx.staff.count({ where });
    return pageResult(staff.map(toSummary), total, { page, limit });
  });
}

/**
 * Optional staff references (class teacher, subject teacher) are single-column foreign keys, so the
 * database cannot tell which institute they belong to. Always resolve them through this check.
 */
async function assertActiveStaff(tx, instituteId, staffIds) {
  const ids = [...new Set(staffIds.filter(Boolean))];
  if (!ids.length) return;
  const found = await tx.staff.count({ where: { instituteId, id: { in: ids }, status: 'active' } });
  if (found !== ids.length) throw AppError.badRequest('Teacher not found or not active');
}

async function loadStaffProfile(tx, instituteId, id) {
  const staff = await tx.staff.findFirst({
    where: { id, instituteId },
    select: {
      ...STAFF_SUMMARY,
      email: true,
      joiningDate: true,
      user: {
        select: {
          id: true,
          status: true,
          lastLoginAt: true,
          mustChangePassword: true,
          userRoles: { select: { role: { select: { id: true, code: true, name: true } } } },
        },
      },
      classSections: {
        where: { academicYear: { status: 'current' } },
        select: { id: true, name: true, level: { select: { name: true } } },
      },
      sectionSubjects: {
        where: { section: { academicYear: { status: 'current' } } },
        select: {
          subject: { select: { name: true, code: true } },
          section: { select: { id: true, name: true, level: { select: { name: true } } } },
        },
      },
    },
  });
  if (!staff) throw AppError.notFound('Staff member not found');

  const { user, classSections, sectionSubjects, joiningDate, ...rest } = staff;
  return {
    ...toSummary(rest),
    joiningDate: formatDateOnly(joiningDate),
    login: user && {
      id: user.id,
      status: user.status,
      lastLoginAt: user.lastLoginAt,
      mustChangePassword: user.mustChangePassword,
      roles: user.userRoles.map((ur) => ur.role),
    },
    classTeacherOf: classSections.map((s) => ({ id: s.id, label: `${s.level.name} - ${s.name}` })),
    teaches: sectionSubjects.map((row) => ({
      sectionId: row.section.id,
      section: `${row.section.level.name} - ${row.section.name}`,
      subject: row.subject.name,
    })),
  };
}

function getStaff(ctx, id) {
  return withTenant(ctx.instituteId, (tx) => loadStaffProfile(tx, ctx.instituteId, id));
}

/** Staff roles can carry real power, so the actor must hold every permission they grant. */
async function loadGrantableRoles(tx, ctx, roleCodes) {
  const roles = await accounts.loadRoles(tx, ctx.instituteId, roleCodes);
  for (const role of roles.values()) assertWithinOwnPermissions(ctx, role.permissions);
  return roles;
}

/** Adds a staff member (and login) to the batch. A phone that already has a login gains the roles. */
function planStaff(batch, { users, roles, row, takeCredential, stats }) {
  const staffId = randomUUID();
  let created = false;
  for (const code of row.roleCodes) {
    const account = accounts.ensureAccount(batch, {
      phone: row.phone,
      name: row.name,
      role: roles.get(code),
      users,
      takeCredential,
    });
    created ||= account.created;
  }
  const user = users.get(row.phone);
  user.staffId = staffId;
  batch.staff.push({
    id: staffId,
    instituteId: batch.instituteId,
    userId: user.id,
    employeeCode: row.employeeCode,
    name: row.name,
    phone: row.phone,
    email: row.email ?? null,
    designation: row.designation ?? null,
    department: row.department ?? null,
    staffType: row.staffType,
    joiningDate: row.joiningDate ?? null,
  });
  stats.staffCreated += 1;
  if (created) stats.usersCreated += 1;
  return staffId;
}

async function createStaff(ctx, body, meta) {
  const pool = await createTemporaryCredentials(
    await withTenant(ctx.instituteId, (tx) =>
      accounts.countPhonesWithoutLogin(tx, ctx.instituteId, [body.phone]),
    ),
  );
  return withTenant(ctx.instituteId, async (tx) => {
    const roles = await loadGrantableRoles(tx, ctx, body.roleCodes);
    const users = await accounts.loadUsersByPhone(tx, ctx.instituteId, [body.phone]);
    const existing = users.get(body.phone);
    if (existing?.staffId)
      throw AppError.conflict('This mobile number already belongs to a staff member');
    if (existing?.studentId) throw AppError.conflict("This mobile number is a student's own login");

    const batch = accounts.createBatch(ctx.instituteId);
    const stats = { staffCreated: 0, usersCreated: 0 };
    const staffId = planStaff(batch, {
      users,
      roles,
      row: body,
      takeCredential: accounts.credentialSource(pool),
      stats,
    });
    await accounts.flushBatch(tx, batch);

    const profile = await loadStaffProfile(tx, ctx.instituteId, staffId);
    await recordAudit(tx, {
      instituteId: ctx.instituteId,
      userId: ctx.userId,
      action: 'staff.create',
      entity: 'staff',
      entityId: staffId,
      after: { employeeCode: profile.employeeCode, name: profile.name, roles: body.roleCodes },
      meta,
    });
    return { staff: profile, credentials: batch.credentials };
  });
}

/**
 * Edits a staff member. Marking someone inactive or left removes their staff roles (family roles
 * such as parent stay) and disables the login if nothing is left.
 */
function updateStaff(ctx, id, changes, meta) {
  return withTenant(ctx.instituteId, async (tx) => {
    const before = await loadStaffProfile(tx, ctx.instituteId, id);
    await tx.staff.update({ where: { id }, data: changes });

    let removedRoles = [];
    if (
      changes.status &&
      changes.status !== 'active' &&
      before.status === 'active' &&
      before.login
    ) {
      const staffRoles = before.login.roles.filter((role) => !FAMILY_ROLES.has(role.code));
      const roleDetails = await accounts.loadRoles(
        tx,
        ctx.instituteId,
        staffRoles.map((role) => role.code),
      );
      assertWithinOwnPermissions(
        ctx,
        [...roleDetails.values()].flatMap((role) => role.permissions),
      );
      removedRoles = staffRoles.map((role) => role.code);
      await tx.userRole.deleteMany({
        where: {
          instituteId: ctx.instituteId,
          userId: before.login.id,
          roleId: { in: staffRoles.map((r) => r.id) },
        },
      });
      await tx.refreshToken.updateMany({
        where: { instituteId: ctx.instituteId, userId: before.login.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (staffRoles.length === before.login.roles.length) {
        await tx.user.update({ where: { id: before.login.id }, data: { status: 'disabled' } });
      }
    }
    if (changes.name && before.login) {
      await tx.user.update({ where: { id: before.login.id }, data: { name: changes.name } });
    }

    const after = await loadStaffProfile(tx, ctx.instituteId, id);
    const fields = Object.keys(changes);
    await recordAudit(tx, {
      instituteId: ctx.instituteId,
      userId: ctx.userId,
      action: 'staff.update',
      entity: 'staff',
      entityId: id,
      before: Object.fromEntries(fields.map((f) => [f, before[f]])),
      after: { ...Object.fromEntries(fields.map((f) => [f, after[f]])), removedRoles },
      meta,
    });
    return after;
  });
}

module.exports = {
  listStaff,
  getStaff,
  createStaff,
  updateStaff,
  planStaff,
  loadGrantableRoles,
  assertActiveStaff,
  STAFF_SUMMARY,
};
