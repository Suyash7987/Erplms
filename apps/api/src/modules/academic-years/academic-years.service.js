const { withTenant } = require('../../lib/prisma');
const { AppError } = require('../../lib/errors');
const { recordAudit } = require('../../lib/audit');
const { toSkipTake, pageResult } = require('../../lib/pagination');
const { formatDateOnly, daysBetween } = require('../../lib/dates');

const MAX_YEAR_DAYS = 731;

const YEAR_SELECT = {
  id: true,
  name: true,
  startDate: true,
  endDate: true,
  status: true,
  _count: { select: { sections: true, enrollments: true } },
};

function toView(year) {
  return {
    id: year.id,
    name: year.name,
    startDate: formatDateOnly(year.startDate),
    endDate: formatDateOnly(year.endDate),
    status: year.status,
    sectionCount: year._count.sections,
    enrollmentCount: year._count.enrollments,
  };
}

async function findYearOrThrow(tx, instituteId, id) {
  const year = await tx.academicYear.findFirst({ where: { id, instituteId }, select: YEAR_SELECT });
  if (!year) throw AppError.notFound('Academic year not found');
  return year;
}

function assertValidRange(startDate, endDate) {
  const days = daysBetween(startDate, endDate);
  if (days <= 0) {
    throw AppError.badRequest('The end date must be after the start date', [
      { location: 'body', path: 'endDate', message: 'Must be after the start date' },
    ]);
  }
  if (days > MAX_YEAR_DAYS) {
    throw AppError.badRequest('An academic year can be at most two years long', [
      { location: 'body', path: 'endDate', message: 'At most two years after the start date' },
    ]);
  }
}

async function assertNoOverlap(tx, instituteId, { startDate, endDate }, excludeId) {
  const clash = await tx.academicYear.findFirst({
    where: {
      instituteId,
      ...(excludeId ? { id: { not: excludeId } } : {}),
      startDate: { lte: endDate },
      endDate: { gte: startDate },
    },
    select: { name: true },
  });
  if (clash) throw AppError.conflict(`These dates overlap with academic year ${clash.name}`);
}

// Serialises changes to the "current" year per institute so two admins cannot create two.
async function lockInstitute(tx, instituteId) {
  await tx.$queryRaw`SELECT id FROM institutes WHERE id = ${instituteId}::uuid FOR UPDATE`;
}

function listYears(ctx, { page, limit, status }) {
  return withTenant(ctx.instituteId, async (tx) => {
    const where = { instituteId: ctx.instituteId, ...(status ? { status } : {}) };
    const years = await tx.academicYear.findMany({
      where,
      orderBy: { startDate: 'desc' },
      select: YEAR_SELECT,
      ...toSkipTake({ page, limit }),
    });
    const total = await tx.academicYear.count({ where });
    return pageResult(years.map(toView), total, { page, limit });
  });
}

function createYear(ctx, { name, startDate, endDate, makeCurrent }, meta) {
  assertValidRange(startDate, endDate);
  return withTenant(ctx.instituteId, async (tx) => {
    await lockInstitute(tx, ctx.instituteId);
    await assertNoOverlap(tx, ctx.instituteId, { startDate, endDate });

    const hasCurrent = await tx.academicYear.count({
      where: { instituteId: ctx.instituteId, status: 'current' },
    });
    const becomesCurrent = makeCurrent || hasCurrent === 0;
    if (becomesCurrent) {
      await tx.academicYear.updateMany({
        where: { instituteId: ctx.instituteId, status: 'current' },
        data: { status: 'closed' },
      });
    }

    const year = await tx.academicYear.create({
      data: {
        instituteId: ctx.instituteId,
        name,
        startDate,
        endDate,
        status: becomesCurrent ? 'current' : 'upcoming',
      },
      select: { id: true },
    });
    // Every academic year gets its own gap-free receipt counter (used by fee collection).
    await tx.receiptSequence.create({
      data: { instituteId: ctx.instituteId, academicYearId: year.id },
    });

    const view = toView(await findYearOrThrow(tx, ctx.instituteId, year.id));
    await recordAudit(tx, {
      instituteId: ctx.instituteId,
      userId: ctx.userId,
      action: 'academic_year.create',
      entity: 'academic_year',
      entityId: year.id,
      after: view,
      meta,
    });
    return view;
  });
}

function updateYear(ctx, id, changes, meta) {
  return withTenant(ctx.instituteId, async (tx) => {
    const before = await findYearOrThrow(tx, ctx.instituteId, id);
    const startDate = changes.startDate ?? before.startDate;
    const endDate = changes.endDate ?? before.endDate;
    assertValidRange(startDate, endDate);
    await assertNoOverlap(tx, ctx.instituteId, { startDate, endDate }, id);

    await tx.academicYear.update({
      where: { id },
      data: { name: changes.name, startDate: changes.startDate, endDate: changes.endDate },
    });
    const view = toView(await findYearOrThrow(tx, ctx.instituteId, id));
    await recordAudit(tx, {
      instituteId: ctx.instituteId,
      userId: ctx.userId,
      action: 'academic_year.update',
      entity: 'academic_year',
      entityId: id,
      before: toView(before),
      after: view,
      meta,
    });
    return view;
  });
}

/** Makes this the institute's only current year; the previous current year is closed. */
function makeCurrent(ctx, id, meta) {
  return withTenant(ctx.instituteId, async (tx) => {
    await lockInstitute(tx, ctx.instituteId);
    const year = await findYearOrThrow(tx, ctx.instituteId, id);
    if (year.status !== 'current') {
      const previous = await tx.academicYear.findFirst({
        where: { instituteId: ctx.instituteId, status: 'current' },
        select: { id: true, name: true },
      });
      await tx.academicYear.updateMany({
        where: { instituteId: ctx.instituteId, status: 'current' },
        data: { status: 'closed' },
      });
      await tx.academicYear.update({ where: { id }, data: { status: 'current' } });
      await recordAudit(tx, {
        instituteId: ctx.instituteId,
        userId: ctx.userId,
        action: 'academic_year.make_current',
        entity: 'academic_year',
        entityId: id,
        before: { current: previous?.name ?? null },
        after: { current: year.name },
        meta,
      });
    }
    return toView(await findYearOrThrow(tx, ctx.instituteId, id));
  });
}

/** Only an unused year can be deleted (no sections or enrollments). */
function deleteYear(ctx, id, meta) {
  return withTenant(ctx.instituteId, async (tx) => {
    const year = await findYearOrThrow(tx, ctx.instituteId, id);
    if (year.status === 'current') {
      throw AppError.conflict('The current academic year cannot be deleted');
    }
    if (year._count.sections || year._count.enrollments) {
      throw AppError.conflict('This academic year already has sections or students');
    }
    await tx.receiptSequence.deleteMany({
      where: { instituteId: ctx.instituteId, academicYearId: id },
    });
    await tx.academicYear.delete({ where: { id } });
    await recordAudit(tx, {
      instituteId: ctx.instituteId,
      userId: ctx.userId,
      action: 'academic_year.delete',
      entity: 'academic_year',
      entityId: id,
      before: toView(year),
      meta,
    });
  });
}

/** The current academic year, or a 409 telling the admin to set one up. */
async function requireCurrentYear(tx, instituteId) {
  const year = await tx.academicYear.findFirst({
    where: { instituteId, status: 'current' },
    select: { id: true, name: true },
  });
  if (!year) throw AppError.conflict('Set up a current academic year first');
  return year;
}

module.exports = {
  listYears,
  createYear,
  updateYear,
  makeCurrent,
  deleteYear,
  requireCurrentYear,
};
