const { AppError } = require('../../lib/errors');

/**
 * The student the active parent/student profile is about. The JWT names the child; the database
 * must confirm that this user is that child's guardian (parent) or the child's own login (student).
 * Must run inside the caller's tenant transaction.
 */
async function resolveOwnStudent(tx, ctx) {
  const studentId = ctx.profile.type === 'student' ? ctx.profile.id : null;
  if (!studentId) throw AppError.forbidden('Switch to a child profile first');
  const allowed =
    ctx.roleCode === 'student'
      ? await tx.student.count({
          where: { id: studentId, instituteId: ctx.instituteId, userId: ctx.userId },
        })
      : await tx.studentGuardian.count({
          where: { instituteId: ctx.instituteId, studentId, guardian: { userId: ctx.userId } },
        });
  if (!allowed) throw AppError.forbidden();
  return tx.student.findFirst({
    where: { id: studentId, instituteId: ctx.instituteId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      enrollments: {
        where: { status: 'active', academicYear: { status: 'current' } },
        take: 1,
        select: { sectionId: true },
      },
    },
  });
}

module.exports = { resolveOwnStudent };
