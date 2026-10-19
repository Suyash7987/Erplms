const { withTenant } = require('../../lib/prisma');
const { AppError } = require('../../lib/errors');
const { recordAudit } = require('../../lib/audit');
const { requireCurrentYear } = require('../academic-years/academic-years.service');
const { assertActiveStaff } = require('../staff/staff.service');
const { resolveOwnStudent } = require('../students/own-student.service');

/** ISO weekdays: 1 = Monday ... 7 = Sunday. Most Indian schools work Monday to Saturday. */
const DEFAULT_WORKING_DAYS = [1, 2, 3, 4, 5, 6];
const MAX_PERIODS = 15;

const sectionLabel = (section) => `${section.level.name} - ${section.name}`;

async function loadWorkingDays(tx, instituteId) {
  const institute = await tx.institute.findFirst({ where: { id: instituteId }, select: { settings: true } });
  const days = institute?.settings?.timetable?.workingDays;
  return Array.isArray(days) && days.length ? [...days].sort() : DEFAULT_WORKING_DAYS;
}

async function resolveYear(tx, instituteId, academicYearId) {
  if (!academicYearId) return requireCurrentYear(tx, instituteId);
  const year = await tx.academicYear.findFirst({
    where: { id: academicYearId, instituteId },
    select: { id: true, name: true },
  });
  if (!year) throw AppError.notFound('Academic year not found');
  return year;
}

const PERIOD_SELECT = {
  id: true,
  periodNo: true,
  name: true,
  startTime: true,
  endTime: true,
  isBreak: true,
  _count: { select: { timetableSlots: true } },
};

const toPeriodView = ({ _count, ...period }) => ({ ...period, slotCount: _count.timetableSlots });

function loadPeriods(tx, instituteId, academicYearId) {
  return tx.period.findMany({
    where: { instituteId, academicYearId },
    orderBy: { periodNo: 'asc' },
    select: PERIOD_SELECT,
  });
}

// ---------------------------------------------------------------------------
// Bell schedule (periods)
// ---------------------------------------------------------------------------

function listPeriods(ctx, { academicYearId }) {
  return withTenant(ctx.instituteId, async (tx) => {
    const year = await resolveYear(tx, ctx.instituteId, academicYearId);
    return {
      academicYear: year,
      workingDays: await loadWorkingDays(tx, ctx.instituteId),
      data: (await loadPeriods(tx, ctx.instituteId, year.id)).map(toPeriodView),
    };
  });
}

function assertNoOverlaps(periods) {
  const sorted = [...periods].sort((a, b) => a.startTime.localeCompare(b.startTime));
  for (let i = 0; i < sorted.length; i += 1) {
    if (sorted[i].endTime <= sorted[i].startTime) {
      throw AppError.badRequest(`"${sorted[i].name}" must end after it starts`);
    }
    if (i > 0 && sorted[i].startTime < sorted[i - 1].endTime) {
      throw AppError.badRequest(`"${sorted[i].name}" overlaps with "${sorted[i - 1].name}"`);
    }
  }
  return sorted;
}

/**
 * Replaces the bell schedule of a year. Existing periods are matched by id so their timetable slots
 * follow them; periods are renumbered by start time. A period that has slots cannot be removed or
 * turned into a break.
 */
function replacePeriods(ctx, { academicYearId, periods }, meta) {
  return withTenant(ctx.instituteId, async (tx) => {
    const year = await resolveYear(tx, ctx.instituteId, academicYearId);
    const sorted = assertNoOverlaps(periods);
    const existing = await loadPeriods(tx, ctx.instituteId, year.id);
    const byId = new Map(existing.map((p) => [p.id, p]));

    const unknown = sorted.filter((p) => p.id && !byId.has(p.id));
    if (unknown.length) throw AppError.badRequest('Some periods do not belong to this academic year');

    const keptIds = new Set(sorted.filter((p) => p.id).map((p) => p.id));
    const removed = existing.filter((p) => !keptIds.has(p.id));
    const inUse = [
      ...removed.filter((p) => p._count.timetableSlots > 0),
      ...sorted.filter((p) => p.id && p.isBreak && byId.get(p.id)._count.timetableSlots > 0),
    ];
    if (inUse.length) {
      throw AppError.conflict('Some periods have timetable entries; clear them first', {
        periods: inUse.map((p) => p.name),
      });
    }

    await tx.period.deleteMany({
      where: { instituteId: ctx.instituteId, id: { in: removed.map((p) => p.id) } },
    });
    // Move kept periods out of the way first so renumbering never collides with the unique index.
    for (const period of existing.filter((p) => keptIds.has(p.id))) {
      await tx.period.update({ where: { id: period.id }, data: { periodNo: period.periodNo + 1000 } });
    }
    for (const [index, period] of sorted.entries()) {
      const data = {
        periodNo: index + 1,
        name: period.name,
        startTime: period.startTime,
        endTime: period.endTime,
        isBreak: period.isBreak,
      };
      if (period.id) {
        await tx.period.update({ where: { id: period.id }, data });
        // Slots keep a copy of the times for fast teacher/room look-ups.
        await tx.timetableSlot.updateMany({
          where: { instituteId: ctx.instituteId, periodId: period.id },
          data: { startTime: period.startTime, endTime: period.endTime },
        });
      } else {
        await tx.period.create({
          data: { instituteId: ctx.instituteId, academicYearId: year.id, ...data },
        });
      }
    }

    const after = (await loadPeriods(tx, ctx.instituteId, year.id)).map(toPeriodView);
    await recordAudit(tx, {
      instituteId: ctx.instituteId,
      userId: ctx.userId,
      action: 'timetable.periods_update',
      entity: 'academic_year',
      entityId: year.id,
      before: existing.map(({ name, startTime, endTime, isBreak }) => ({ name, startTime, endTime, isBreak })),
      after: after.map(({ name, startTime, endTime, isBreak }) => ({ name, startTime, endTime, isBreak })),
      meta,
    });
    return { academicYear: year, workingDays: await loadWorkingDays(tx, ctx.instituteId), data: after };
  });
}

// ---------------------------------------------------------------------------
// Timetable views
// ---------------------------------------------------------------------------

const SLOT_SELECT = {
  id: true,
  dayOfWeek: true,
  periodId: true,
  startTime: true,
  endTime: true,
  room: true,
  subject: { select: { id: true, name: true, code: true } },
  teacher: { select: { id: true, name: true } },
  section: { select: { id: true, name: true, level: { select: { name: true } } } },
};

const toSlotView = ({ section, ...slot }) => ({
  ...slot,
  section: { id: section.id, label: sectionLabel(section) },
});

async function findSectionOrThrow(tx, instituteId, sectionId) {
  const section = await tx.section.findFirst({
    where: { id: sectionId, instituteId },
    select: {
      id: true,
      name: true,
      room: true,
      academicYearId: true,
      level: { select: { name: true } },
      classTeacher: { select: { id: true, name: true } },
    },
  });
  if (!section) throw AppError.notFound('Section not found');
  return section;
}

/** Staff with academics.view see any section; families only their own child's section. */
async function assertCanViewSection(tx, ctx, sectionId) {
  if (ctx.permissions.has('academics.view')) return;
  const student = await resolveOwnStudent(tx, ctx);
  if (student.enrollments[0]?.sectionId !== sectionId) throw AppError.forbidden();
}

async function sectionTimetable(tx, ctx, sectionId) {
  const section = await findSectionOrThrow(tx, ctx.instituteId, sectionId);
  const periods = await loadPeriods(tx, ctx.instituteId, section.academicYearId);
  const slots = await tx.timetableSlot.findMany({
    where: { instituteId: ctx.instituteId, sectionId },
    orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    select: SLOT_SELECT,
  });
  const subjects = await tx.sectionSubject.findMany({
    where: { instituteId: ctx.instituteId, sectionId },
    orderBy: { subject: { name: 'asc' } },
    select: { subject: { select: { id: true, name: true, code: true } }, teacher: { select: { id: true, name: true } } },
  });
  return {
    section: {
      id: section.id,
      label: sectionLabel(section),
      room: section.room,
      classTeacher: section.classTeacher,
    },
    workingDays: await loadWorkingDays(tx, ctx.instituteId),
    periods: periods.map(toPeriodView),
    slots: slots.map(toSlotView),
    subjects: subjects.map((row) => ({ ...row.subject, teacher: row.teacher })),
  };
}

function getSectionTimetable(ctx, sectionId) {
  return withTenant(ctx.instituteId, async (tx) => {
    await assertCanViewSection(tx, ctx, sectionId);
    return sectionTimetable(tx, ctx, sectionId);
  });
}

async function teacherTimetable(tx, ctx, staffId) {
  const staff = await tx.staff.findFirst({
    where: { id: staffId, instituteId: ctx.instituteId },
    select: { id: true, name: true },
  });
  if (!staff) throw AppError.notFound('Staff member not found');
  const year = await requireCurrentYear(tx, ctx.instituteId);
  const slots = await tx.timetableSlot.findMany({
    where: { instituteId: ctx.instituteId, teacherStaffId: staffId, academicYearId: year.id },
    orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    select: SLOT_SELECT,
  });
  return {
    teacher: staff,
    workingDays: await loadWorkingDays(tx, ctx.instituteId),
    periods: (await loadPeriods(tx, ctx.instituteId, year.id)).map(toPeriodView),
    slots: slots.map(toSlotView),
    weeklyPeriods: slots.length,
  };
}

/** Anyone with staff.view can see a teacher's week; teachers can always see their own. */
function getTeacherTimetable(ctx, staffId) {
  return withTenant(ctx.instituteId, async (tx) => {
    const own = ctx.profile.type === 'staff' && ctx.profile.id === staffId;
    if (!own && !ctx.permissions.has('staff.view')) throw AppError.forbidden();
    return teacherTimetable(tx, ctx, staffId);
  });
}

/** The signed-in user's timetable: a teacher's week, or the active child's section. */
function getMyTimetable(ctx) {
  return withTenant(ctx.instituteId, async (tx) => {
    if (ctx.profile.type === 'staff' && ctx.profile.id) {
      return { kind: 'teacher', ...(await teacherTimetable(tx, ctx, ctx.profile.id)) };
    }
    const student = await resolveOwnStudent(tx, ctx);
    const sectionId = student.enrollments[0]?.sectionId;
    if (!sectionId) throw AppError.notFound('Not placed in a class this year');
    return { kind: 'section', ...(await sectionTimetable(tx, ctx, sectionId)) };
  });
}

// ---------------------------------------------------------------------------
// Editing slots (with clash detection)
// ---------------------------------------------------------------------------

/** Teachers and rooms already used at this day and period, so the editor can warn up front. */
function getAvailability(ctx, { dayOfWeek, periodId }) {
  return withTenant(ctx.instituteId, async (tx) => {
    const slots = await tx.timetableSlot.findMany({
      where: { instituteId: ctx.instituteId, dayOfWeek, periodId },
      select: { teacherStaffId: true, room: true, section: { select: { id: true, name: true, level: { select: { name: true } } } } },
    });
    return {
      teachers: slots
        .filter((s) => s.teacherStaffId)
        .map((s) => ({ staffId: s.teacherStaffId, section: { id: s.section.id, label: sectionLabel(s.section) } })),
      rooms: slots
        .filter((s) => s.room)
        .map((s) => ({ room: s.room, section: { id: s.section.id, label: sectionLabel(s.section) } })),
    };
  });
}

async function findClash(tx, ctx, { dayOfWeek, periodId, sectionId, field, value }) {
  if (!value) return null;
  const clash = await tx.timetableSlot.findFirst({
    where: {
      instituteId: ctx.instituteId,
      dayOfWeek,
      periodId,
      sectionId: { not: sectionId },
      [field]: field === 'room' ? { equals: value, mode: 'insensitive' } : value,
    },
    select: {
      subject: { select: { name: true } },
      teacher: { select: { name: true } },
      section: { select: { name: true, level: { select: { name: true } } } },
    },
  });
  return clash;
}

/**
 * Sets one timetable cell (section x day x period). The teacher defaults to the one assigned to
 * the subject for this section. Teacher and room clashes are rejected with a clear message; unique
 * indexes in the database enforce the same rule if two edits race.
 */
function setSlot(ctx, { sectionId, dayOfWeek, periodId, subjectId, teacherStaffId, room }, meta) {
  return withTenant(ctx.instituteId, async (tx) => {
    const section = await findSectionOrThrow(tx, ctx.instituteId, sectionId);
    const workingDays = await loadWorkingDays(tx, ctx.instituteId);
    if (!workingDays.includes(dayOfWeek)) throw AppError.badRequest('That day is not a working day');

    const period = await tx.period.findFirst({
      where: { id: periodId, instituteId: ctx.instituteId, academicYearId: section.academicYearId },
      select: { id: true, name: true, startTime: true, endTime: true, isBreak: true },
    });
    if (!period) throw AppError.badRequest('This period is not part of the section’s academic year');
    if (period.isBreak) throw AppError.badRequest(`${period.name} is a break`);

    const mapping = await tx.sectionSubject.findFirst({
      where: { instituteId: ctx.instituteId, sectionId, subjectId },
      select: { teacherStaffId: true, subject: { select: { isActive: true } } },
    });
    if (!mapping) {
      throw AppError.badRequest('Add this subject to the section first (Classes → section → Subjects)');
    }
    if (!mapping.subject.isActive) throw AppError.badRequest('This subject is inactive');

    const teacher = teacherStaffId === undefined ? mapping.teacherStaffId : teacherStaffId;
    await assertActiveStaff(tx, ctx.instituteId, [teacher]);
    const roomName = room?.trim() || null;

    const where = { dayOfWeek, periodId, sectionId };
    const teacherClash = await findClash(tx, ctx, { ...where, field: 'teacherStaffId', value: teacher });
    if (teacherClash) {
      throw AppError.conflict(
        `${teacherClash.teacher.name} already teaches ${sectionLabel(teacherClash.section)} in ${period.name}`,
        { type: 'teacher', section: sectionLabel(teacherClash.section), subject: teacherClash.subject.name },
      );
    }
    const roomClash = await findClash(tx, ctx, { ...where, field: 'room', value: roomName });
    if (roomClash) {
      throw AppError.conflict(
        `Room ${roomName} is used by ${sectionLabel(roomClash.section)} in ${period.name}`,
        { type: 'room', section: sectionLabel(roomClash.section), subject: roomClash.subject.name },
      );
    }

    const data = {
      subjectId,
      teacherStaffId: teacher ?? null,
      room: roomName,
      startTime: period.startTime,
      endTime: period.endTime,
    };
    const unique = {
      instituteId_academicYearId_sectionId_dayOfWeek_periodId: {
        instituteId: ctx.instituteId,
        academicYearId: section.academicYearId,
        sectionId,
        dayOfWeek,
        periodId,
      },
    };
    const before = await tx.timetableSlot.findUnique({ where: unique, select: SLOT_SELECT });
    const slot = await tx.timetableSlot.upsert({
      where: unique,
      update: data,
      create: {
        instituteId: ctx.instituteId,
        academicYearId: section.academicYearId,
        sectionId,
        dayOfWeek,
        periodId,
        ...data,
      },
      select: SLOT_SELECT,
    });
    await recordAudit(tx, {
      instituteId: ctx.instituteId,
      userId: ctx.userId,
      action: 'timetable.slot_set',
      entity: 'section',
      entityId: sectionId,
      before: before && { day: dayOfWeek, period: period.name, subject: before.subject.code, teacher: before.teacher?.name ?? null, room: before.room },
      after: { day: dayOfWeek, period: period.name, subject: slot.subject.code, teacher: slot.teacher?.name ?? null, room: slot.room },
      meta,
    });
    return toSlotView(slot);
  });
}

function clearSlot(ctx, slotId, meta) {
  return withTenant(ctx.instituteId, async (tx) => {
    const slot = await tx.timetableSlot.findFirst({
      where: { id: slotId, instituteId: ctx.instituteId },
      select: SLOT_SELECT,
    });
    if (!slot) throw AppError.notFound('Timetable entry not found');
    await tx.timetableSlot.delete({ where: { id: slotId } });
    await recordAudit(tx, {
      instituteId: ctx.instituteId,
      userId: ctx.userId,
      action: 'timetable.slot_clear',
      entity: 'section',
      entityId: slot.section.id,
      before: { day: slot.dayOfWeek, subject: slot.subject.code, teacher: slot.teacher?.name ?? null, room: slot.room },
      meta,
    });
  });
}

/** A unique-index violation from a racing edit becomes the same friendly 409 as the pre-check. */
function translateClash(error) {
  if (error?.code !== 'P2002') return error;
  const target = String(error.meta?.target ?? '');
  if (target.includes('teacher')) return AppError.conflict('This teacher was just booked for that period', { type: 'teacher' });
  if (target.includes('room')) return AppError.conflict('This room was just booked for that period', { type: 'room' });
  return error;
}

async function setSlotSafely(ctx, body, meta) {
  try {
    return await setSlot(ctx, body, meta);
  } catch (error) {
    throw translateClash(error);
  }
}

module.exports = {
  MAX_PERIODS,
  listPeriods,
  replacePeriods,
  getSectionTimetable,
  getTeacherTimetable,
  getMyTimetable,
  getAvailability,
  setSlot: setSlotSafely,
  clearSlot,
};
