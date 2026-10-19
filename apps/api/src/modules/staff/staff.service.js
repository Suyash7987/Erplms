const { withTenant } = require('../../lib/prisma');
const { AppError } = require('../../lib/errors');
const { toSkipTake, pageResult } = require('../../lib/pagination');

const STAFF_SUMMARY = {
  id: true,
  name: true,
  employeeCode: true,
  designation: true,
  staffType: true,
  status: true,
};

/** Staff directory (search for pickers such as class teacher). Full staff management is M5. */
function listStaff(ctx, { page, limit, q, staffType, status }) {
  return withTenant(ctx.instituteId, async (tx) => {
    const where = {
      instituteId: ctx.instituteId,
      status,
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
    return pageResult(staff, total, { page, limit });
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

module.exports = { listStaff, assertActiveStaff, STAFF_SUMMARY };
