const { withTenant } = require('../../lib/prisma');
const { AppError } = require('../../lib/errors');
const { recordAudit } = require('../../lib/audit');
const { toSkipTake, pageResult } = require('../../lib/pagination');

const fullName = (s) => [s.firstName, s.lastName].filter(Boolean).join(' ');

const GUARDIAN_SELECT = {
  id: true,
  name: true,
  phone: true,
  email: true,
  occupation: true,
  address: true,
  userId: true,
  students: {
    select: {
      relation: true,
      isPrimary: true,
      isFeePayer: true,
      student: {
        select: { id: true, firstName: true, lastName: true, admissionNo: true, status: true },
      },
    },
  },
};

function toView({ userId, students, ...guardian }) {
  return {
    ...guardian,
    hasLogin: Boolean(userId),
    children: students.map((link) => ({
      id: link.student.id,
      name: fullName(link.student),
      admissionNo: link.student.admissionNo,
      status: link.student.status,
      relation: link.relation,
      isPrimary: link.isPrimary,
      isFeePayer: link.isFeePayer,
    })),
  };
}

function listGuardians(ctx, { page, limit, q }) {
  return withTenant(ctx.instituteId, async (tx) => {
    const digits = q?.replace(/\D/g, '') ?? '';
    const where = {
      instituteId: ctx.instituteId,
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : []),
            ],
          }
        : {}),
    };
    const guardians = await tx.guardian.findMany({
      where,
      orderBy: { name: 'asc' },
      select: GUARDIAN_SELECT,
      ...toSkipTake({ page, limit }),
    });
    const total = await tx.guardian.count({ where });
    return pageResult(guardians.map(toView), total, { page, limit });
  });
}

async function findGuardianOrThrow(tx, instituteId, id) {
  const guardian = await tx.guardian.findFirst({
    where: { id, instituteId },
    select: GUARDIAN_SELECT,
  });
  if (!guardian) throw AppError.notFound('Guardian not found');
  return guardian;
}

function getGuardian(ctx, id) {
  return withTenant(ctx.instituteId, async (tx) =>
    toView(await findGuardianOrThrow(tx, ctx.instituteId, id)),
  );
}

/**
 * The phone number is the guardian's login and sibling key, so it is not editable here; to change
 * it, link a guardian with the new number and unlink the old one.
 */
function updateGuardian(ctx, id, changes, meta) {
  return withTenant(ctx.instituteId, async (tx) => {
    const before = await findGuardianOrThrow(tx, ctx.instituteId, id);
    await tx.guardian.update({ where: { id }, data: changes });
    if (changes.name && before.userId) {
      await tx.user.update({ where: { id: before.userId }, data: { name: changes.name } });
    }
    const after = await findGuardianOrThrow(tx, ctx.instituteId, id);
    const fields = Object.keys(changes);
    await recordAudit(tx, {
      instituteId: ctx.instituteId,
      userId: ctx.userId,
      action: 'guardian.update',
      entity: 'guardian',
      entityId: id,
      before: Object.fromEntries(fields.map((f) => [f, before[f]])),
      after: Object.fromEntries(fields.map((f) => [f, after[f]])),
      meta,
    });
    return toView(after);
  });
}

module.exports = { listGuardians, getGuardian, updateGuardian };
