const { withTenant } = require('../../lib/prisma');
const { AppError } = require('../../lib/errors');
const { recordAudit } = require('../../lib/audit');
const { toSkipTake, pageResult } = require('../../lib/pagination');
const { requireCurrentYear } = require('../academic-years/academic-years.service');
const { assertActiveStaff } = require('../staff/staff.service');

const SECTION_SELECT = {
  id: true,
  name: true,
  capacity: true,
  room: true,
  isActive: true,
  academicYear: { select: { id: true, name: true, status: true } },
  level: { select: { id: true, name: true, band: true, sortOrder: true } },
  classTeacher: { select: { id: true, name: true } },
  _count: {
    select: { enrollments: { where: { status: 'active' } }, sectionSubjects: true },
  },
};

const toView = ({ _count, ...section }) => ({
  ...section,
  studentCount: _count.enrollments,
  subjectCount: _count.sectionSubjects,
});

async function findSectionOrThrow(tx, instituteId, id) {
  const section = await tx.section.findFirst({
    where: { id, instituteId },
    select: SECTION_SELECT,
  });
  if (!section) throw AppError.notFound('Section not found');
  return section;
}

async function assertYearAndLevels(tx, instituteId, academicYearId, levelIds) {
  const year = await tx.academicYear.findFirst({
    where: { id: academicYearId, instituteId },
    select: { id: true },
  });
  if (!year) throw AppError.notFound('Academic year not found');
  const ids = [...new Set(levelIds)];
  const found = await tx.level.count({ where: { instituteId, id: { in: ids } } });
  if (found !== ids.length) throw AppError.notFound('Class not found');
}

/** Sections of one academic year (the current one unless academicYearId is given). */
function listSections(ctx, { page, limit, academicYearId, levelId }) {
  return withTenant(ctx.instituteId, async (tx) => {
    const yearId = academicYearId ?? (await requireCurrentYear(tx, ctx.instituteId)).id;
    const where = {
      instituteId: ctx.instituteId,
      academicYearId: yearId,
      ...(levelId ? { levelId } : {}),
    };
    const sections = await tx.section.findMany({
      where,
      orderBy: [{ level: { sortOrder: 'asc' } }, { name: 'asc' }],
      select: SECTION_SELECT,
      ...toSkipTake({ page, limit }),
    });
    const total = await tx.section.count({ where });
    return { ...pageResult(sections.map(toView), total, { page, limit }), academicYearId: yearId };
  });
}

function createSection(ctx, { academicYearId, levelId, classTeacherStaffId, ...rest }) {
  return withTenant(ctx.instituteId, async (tx) => {
    await assertYearAndLevels(tx, ctx.instituteId, academicYearId, [levelId]);
    await assertActiveStaff(tx, ctx.instituteId, [classTeacherStaffId]);
    const section = await tx.section.create({
      data: { instituteId: ctx.instituteId, academicYearId, levelId, classTeacherStaffId, ...rest },
      select: { id: true },
    });
    return toView(await findSectionOrThrow(tx, ctx.instituteId, section.id));
  });
}

/** Creates the same section names (e.g. A, B) for several classes; existing ones are skipped. */
function createSectionGrid(ctx, { academicYearId, levelIds, names, capacity }) {
  return withTenant(ctx.instituteId, async (tx) => {
    await assertYearAndLevels(tx, ctx.instituteId, academicYearId, levelIds);
    const data = levelIds.flatMap((levelId) =>
      names.map((name) => ({
        instituteId: ctx.instituteId,
        academicYearId,
        levelId,
        name,
        capacity,
      })),
    );
    const { count } = await tx.section.createMany({ data, skipDuplicates: true });
    return { created: count, skipped: data.length - count };
  });
}

function updateSection(ctx, id, changes) {
  return withTenant(ctx.instituteId, async (tx) => {
    await findSectionOrThrow(tx, ctx.instituteId, id);
    await assertActiveStaff(tx, ctx.instituteId, [changes.classTeacherStaffId]);
    await tx.section.update({ where: { id }, data: changes });
    return toView(await findSectionOrThrow(tx, ctx.instituteId, id));
  });
}

function deleteSection(ctx, id) {
  return withTenant(ctx.instituteId, async (tx) => {
    const section = await findSectionOrThrow(tx, ctx.instituteId, id);
    const enrolled = await tx.studentEnrollment.count({
      where: { instituteId: ctx.instituteId, sectionId: id },
    });
    if (enrolled) {
      throw AppError.conflict(
        'This section has students. Mark it inactive instead of deleting it.',
      );
    }
    await tx.sectionSubject.deleteMany({ where: { instituteId: ctx.instituteId, sectionId: id } });
    await tx.section.delete({ where: { id: section.id } });
  });
}

// ---------------------------------------------------------------------------
// Subjects taught in a section, and their teachers
// ---------------------------------------------------------------------------

const MAPPING_SELECT = {
  id: true,
  subject: { select: { id: true, name: true, code: true } },
  teacher: { select: { id: true, name: true } },
};

function listSectionSubjects(tx, instituteId, sectionId) {
  return tx.sectionSubject.findMany({
    where: { instituteId, sectionId },
    orderBy: { subject: { name: 'asc' } },
    select: MAPPING_SELECT,
  });
}

function getSectionSubjects(ctx, sectionId) {
  return withTenant(ctx.instituteId, async (tx) => {
    const section = await findSectionOrThrow(tx, ctx.instituteId, sectionId);
    return {
      section: toView(section),
      data: await listSectionSubjects(tx, ctx.instituteId, sectionId),
    };
  });
}

/**
 * Replaces the section's subject list. Subjects not in `items` are removed; each subject can have
 * one teacher (or none yet).
 */
function setSectionSubjects(ctx, sectionId, items, meta) {
  return withTenant(ctx.instituteId, async (tx) => {
    const section = await findSectionOrThrow(tx, ctx.instituteId, sectionId);
    const subjectIds = items.map((item) => item.subjectId);
    const foundSubjects = await tx.subject.count({
      where: { instituteId: ctx.instituteId, id: { in: subjectIds } },
    });
    if (foundSubjects !== subjectIds.length) throw AppError.notFound('Subject not found');
    await assertActiveStaff(
      tx,
      ctx.instituteId,
      items.map((item) => item.teacherStaffId),
    );

    const before = await listSectionSubjects(tx, ctx.instituteId, sectionId);
    await tx.sectionSubject.deleteMany({
      where: { instituteId: ctx.instituteId, sectionId, subjectId: { notIn: subjectIds } },
    });
    for (const item of items) {
      await tx.sectionSubject.upsert({
        where: {
          instituteId_sectionId_subjectId: {
            instituteId: ctx.instituteId,
            sectionId,
            subjectId: item.subjectId,
          },
        },
        update: { teacherStaffId: item.teacherStaffId ?? null },
        create: {
          instituteId: ctx.instituteId,
          sectionId,
          subjectId: item.subjectId,
          teacherStaffId: item.teacherStaffId ?? null,
        },
      });
    }

    const after = await listSectionSubjects(tx, ctx.instituteId, sectionId);
    const summary = (rows) =>
      rows.map((row) => ({ subject: row.subject.code, teacher: row.teacher?.name ?? null }));
    await recordAudit(tx, {
      instituteId: ctx.instituteId,
      userId: ctx.userId,
      action: 'section.subjects_update',
      entity: 'section',
      entityId: sectionId,
      before: summary(before),
      after: summary(after),
      meta,
    });
    return { section: toView(section), data: after };
  });
}

module.exports = {
  listSections,
  createSection,
  createSectionGrid,
  updateSection,
  deleteSection,
  getSectionSubjects,
  setSectionSubjects,
};
