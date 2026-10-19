const { withTenant } = require('../../lib/prisma');
const { AppError } = require('../../lib/errors');
const { toSkipTake, pageResult } = require('../../lib/pagination');

const SUBJECT_SELECT = {
  id: true,
  name: true,
  code: true,
  isActive: true,
  _count: { select: { sectionSubjects: true } },
};

const toView = ({ _count, ...subject }) => ({ ...subject, sectionCount: _count.sectionSubjects });

async function findSubjectOrThrow(tx, instituteId, id) {
  const subject = await tx.subject.findFirst({
    where: { id, instituteId },
    select: SUBJECT_SELECT,
  });
  if (!subject) throw AppError.notFound('Subject not found');
  return subject;
}

function listSubjects(ctx, { page, limit, q, includeInactive }) {
  return withTenant(ctx.instituteId, async (tx) => {
    const where = {
      instituteId: ctx.instituteId,
      ...(includeInactive ? {} : { isActive: true }),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { code: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const subjects = await tx.subject.findMany({
      where,
      orderBy: { name: 'asc' },
      select: SUBJECT_SELECT,
      ...toSkipTake({ page, limit }),
    });
    const total = await tx.subject.count({ where });
    return pageResult(subjects.map(toView), total, { page, limit });
  });
}

/** Creates one or more subjects; existing codes are skipped (used by the setup wizard presets). */
function createSubjects(ctx, subjects) {
  return withTenant(ctx.instituteId, async (tx) => {
    const { count } = await tx.subject.createMany({
      data: subjects.map((subject) => ({ instituteId: ctx.instituteId, ...subject })),
      skipDuplicates: true,
    });
    const created = await tx.subject.findMany({
      where: { instituteId: ctx.instituteId, code: { in: subjects.map((s) => s.code) } },
      orderBy: { name: 'asc' },
      select: SUBJECT_SELECT,
    });
    return { created: count, skipped: subjects.length - count, data: created.map(toView) };
  });
}

function updateSubject(ctx, id, changes) {
  return withTenant(ctx.instituteId, async (tx) => {
    await findSubjectOrThrow(tx, ctx.instituteId, id);
    await tx.subject.update({ where: { id }, data: changes });
    return toView(await findSubjectOrThrow(tx, ctx.instituteId, id));
  });
}

function deleteSubject(ctx, id) {
  return withTenant(ctx.instituteId, async (tx) => {
    const subject = await findSubjectOrThrow(tx, ctx.instituteId, id);
    if (subject._count.sectionSubjects) {
      throw AppError.conflict(
        'This subject is taught in some sections. Mark it inactive instead of deleting it.',
      );
    }
    await tx.subject.delete({ where: { id } });
  });
}

module.exports = { listSubjects, createSubjects, updateSubject, deleteSubject };
