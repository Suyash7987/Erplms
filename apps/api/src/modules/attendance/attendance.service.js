const { withTenant } = require('../../lib/prisma');
const { env } = require('../../config/env');
const { AppError } = require('../../lib/errors');
const { recordAudit } = require('../../lib/audit');
const { notifyUsers } = require('../../lib/notify');
const { toLocalDateString } = require('../../lib/time');
const { formatDateOnly, parseDateOnly, daysBetween } = require('../../lib/dates');
const { requireCurrentYear } = require('../academic-years/academic-years.service');
const { resolveOwnStudent } = require('../students/own-student.service');

const SESSION_TYPES = { 1: ['full_day'], 2: ['morning', 'afternoon'] };
const DEFAULT_EDIT_WINDOW_DAYS = 2;

const fullName = (s) => [s.firstName, s.lastName].filter(Boolean).join(' ');
const todayIst = () => parseDateOnly(toLocalDateString(new Date(), env.APP_TIMEZONE));
const sectionLabel = (section) => `${section.level.name} - ${section.name}`;

/** Attendance share: present and late count fully, half day as half. */
function summarize(statuses) {
  const counts = { present: 0, absent: 0, late: 0, half_day: 0, on_leave: 0 };
  for (const status of statuses) counts[status] += 1;
  const marked = statuses.length;
  const attended = counts.present + counts.late + counts.half_day / 2;
  return {
    marked,
    present: counts.present,
    absent: counts.absent,
    late: counts.late,
    halfDay: counts.half_day,
    onLeave: counts.on_leave,
    percentage: marked ? Math.round((attended / marked) * 1000) / 10 : null,
  };
}

async function loadSettings(tx, instituteId) {
  const institute = await tx.institute.findFirst({
    where: { id: instituteId },
    select: { settings: true },
  });
  const attendance = institute?.settings?.attendance ?? {};
  return {
    editWindowDays: attendance.editWindowDays ?? DEFAULT_EDIT_WINDOW_DAYS,
    sessionTypes: SESSION_TYPES[attendance.sessionsPerDay] ?? SESSION_TYPES[1],
  };
}

const SECTION_SELECT = {
  id: true,
  name: true,
  isActive: true,
  classTeacherStaffId: true,
  level: { select: { name: true } },
  academicYear: { select: { id: true, name: true, startDate: true, endDate: true, status: true } },
};

async function findSectionOrThrow(tx, instituteId, sectionId) {
  const section = await tx.section.findFirst({
    where: { id: sectionId, instituteId },
    select: SECTION_SELECT,
  });
  if (!section) throw AppError.notFound('Section not found');
  return section;
}

/**
 * Who may mark a section: anyone with attendance.edit_any (admins), otherwise the section's class
 * teacher or a teacher of one of its subjects (taken from the active staff profile).
 */
async function canMarkSection(tx, ctx, section) {
  if (ctx.permissions.has('attendance.edit_any')) return true;
  if (!ctx.permissions.has('attendance.mark')) return false;
  const staffId = ctx.profile.type === 'staff' ? ctx.profile.id : null;
  if (!staffId) return false;
  if (section.classTeacherStaffId === staffId) return true;
  const teaches = await tx.sectionSubject.count({
    where: { instituteId: ctx.instituteId, sectionId: section.id, teacherStaffId: staffId },
  });
  return teaches > 0;
}

function assertDateInYear(date, section) {
  if (date > todayIst()) throw AppError.badRequest('Attendance cannot be marked for a future date');
  const { startDate, endDate, name } = section.academicYear;
  if (date < startDate || date > endDate) {
    throw AppError.badRequest(`The date is outside academic year ${name}`);
  }
}

/** Teachers can mark or change attendance up to `editWindowDays` days back; admins any time. */
function editWindow(ctx, date, settings) {
  const age = daysBetween(date, todayIst());
  const lastDay = new Date(date.getTime() + settings.editWindowDays * 86_400_000);
  const withinWindow = age <= settings.editWindowDays;
  return {
    editable: withinWindow || ctx.permissions.has('attendance.edit_any'),
    editableUntil: formatDateOnly(lastDay),
    withinWindow,
  };
}

/** Students enrolled (active) in the section, in roll-number order, with approved leave on `date`. */
async function loadRoster(tx, ctx, section, date) {
  const enrollments = await tx.studentEnrollment.findMany({
    where: {
      instituteId: ctx.instituteId,
      sectionId: section.id,
      academicYearId: section.academicYear.id,
      status: 'active',
      student: { status: 'active' },
    },
    orderBy: [{ rollNo: 'asc' }, { student: { firstName: 'asc' } }],
    select: { rollNo: true, student: { select: { id: true, firstName: true, lastName: true } } },
  });
  const studentIds = enrollments.map((e) => e.student.id);
  const leaves = await tx.leave.findMany({
    where: {
      instituteId: ctx.instituteId,
      studentId: { in: studentIds },
      status: 'approved',
      fromDate: { lte: date },
      toDate: { gte: date },
    },
    select: { studentId: true },
  });
  const onLeave = new Set(leaves.map((leave) => leave.studentId));
  return enrollments.map((e) => ({
    id: e.student.id,
    name: fullName(e.student),
    rollNo: e.rollNo,
    onLeave: onLeave.has(e.student.id),
  }));
}

async function buildRosterView(tx, ctx, section, date, session, settings) {
  const roster = await loadRoster(tx, ctx, section, date);
  const attendanceSession = await tx.attendanceSession.findFirst({
    where: { instituteId: ctx.instituteId, sectionId: section.id, date, session },
    select: {
      id: true,
      markedAt: true,
      markedByUserId: true,
      records: { select: { studentId: true, status: true, remark: true } },
    },
  });
  const records = new Map((attendanceSession?.records ?? []).map((r) => [r.studentId, r]));
  const markedBy = attendanceSession?.markedByUserId
    ? await tx.user.findFirst({
        where: { id: attendanceSession.markedByUserId, instituteId: ctx.instituteId },
        select: { name: true },
      })
    : null;

  const students = roster.map((student) => {
    const record = records.get(student.id);
    return {
      ...student,
      status: record?.status ?? (student.onLeave ? 'on_leave' : 'present'),
      remark: record?.remark ?? null,
      saved: Boolean(record),
    };
  });
  const window = editWindow(ctx, date, settings);
  const canMark = await canMarkSection(tx, ctx, section);

  return {
    section: {
      id: section.id,
      label: sectionLabel(section),
      academicYear: section.academicYear.name,
    },
    date: formatDateOnly(date),
    session,
    sessionTypes: settings.sessionTypes,
    marked: Boolean(attendanceSession),
    markedAt: attendanceSession?.markedAt ?? null,
    markedBy: markedBy?.name ?? null,
    canMark: canMark && window.editable,
    editableUntil: window.editableUntil,
    lockedReason: !canMark ? 'not_assigned' : window.editable ? null : 'edit_window_closed',
    students,
    summary: summarize(students.map((s) => s.status)),
  };
}

function resolveSession(session, settings) {
  const value = session ?? settings.sessionTypes[0];
  if (!settings.sessionTypes.includes(value)) {
    throw AppError.badRequest(
      `This institute takes attendance as: ${settings.sessionTypes.join(', ')}`,
    );
  }
  return value;
}

// ---------------------------------------------------------------------------
// Marking
// ---------------------------------------------------------------------------

/** Sections the signed-in user can mark (class teacher / subject teacher, or all for admins). */
function listMarkableSections(ctx) {
  return withTenant(ctx.instituteId, async (tx) => {
    const year = await requireCurrentYear(tx, ctx.instituteId);
    const staffId = ctx.profile.type === 'staff' ? ctx.profile.id : null;
    const anySection = ctx.permissions.has('attendance.edit_any');
    if (!anySection && !staffId) return { data: [] };

    const sections = await tx.section.findMany({
      where: {
        instituteId: ctx.instituteId,
        academicYearId: year.id,
        isActive: true,
        ...(anySection
          ? {}
          : {
              OR: [
                { classTeacherStaffId: staffId },
                { sectionSubjects: { some: { teacherStaffId: staffId } } },
              ],
            }),
      },
      orderBy: [{ level: { sortOrder: 'asc' } }, { name: 'asc' }],
      select: {
        ...SECTION_SELECT,
        _count: { select: { enrollments: { where: { status: 'active' } } } },
      },
    });
    const today = todayIst();
    const markedToday = await tx.attendanceSession.findMany({
      where: {
        instituteId: ctx.instituteId,
        date: today,
        sectionId: { in: sections.map((s) => s.id) },
      },
      select: { sectionId: true, session: true },
    });
    return {
      date: formatDateOnly(today),
      data: sections.map((section) => ({
        id: section.id,
        label: sectionLabel(section),
        isClassTeacher: Boolean(staffId) && section.classTeacherStaffId === staffId,
        studentCount: section._count.enrollments,
        markedToday: markedToday.filter((m) => m.sectionId === section.id).map((m) => m.session),
      })),
    };
  });
}

function getRoster(ctx, { sectionId, date, session }) {
  return withTenant(ctx.instituteId, async (tx) => {
    const settings = await loadSettings(tx, ctx.instituteId);
    const section = await findSectionOrThrow(tx, ctx.instituteId, sectionId);
    const day = date ?? todayIst();
    assertDateInYear(day, section);
    return buildRosterView(tx, ctx, section, day, resolveSession(session, settings), settings);
  });
}

function formatNoticeDate(date) {
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

/**
 * Saves a section's attendance for one date and session. Students not listed are present (or on
 * leave when they have approved leave). Newly absent students notify their guardians in the app.
 */
function saveAttendance(ctx, { sectionId, date, session, records }, meta) {
  return withTenant(
    ctx.instituteId,
    async (tx) => {
      const settings = await loadSettings(tx, ctx.instituteId);
      const section = await findSectionOrThrow(tx, ctx.instituteId, sectionId);
      const day = date ?? todayIst();
      const sessionType = resolveSession(session, settings);
      assertDateInYear(day, section);
      if (!section.isActive) throw AppError.conflict('This section is inactive');
      if (!(await canMarkSection(tx, ctx, section))) {
        throw AppError.forbidden('You can only mark attendance for your own sections');
      }
      const window = editWindow(ctx, day, settings);
      if (!window.editable) {
        throw new AppError(
          403,
          'FORBIDDEN',
          `Attendance can only be changed within ${settings.editWindowDays} day(s). Ask an admin to correct it.`,
          { editableUntil: window.editableUntil },
        );
      }

      const roster = await loadRoster(tx, ctx, section, day);
      const rosterIds = new Set(roster.map((s) => s.id));
      const unknown = records.filter((r) => !rosterIds.has(r.studentId));
      if (unknown.length) {
        throw AppError.badRequest('Some students are not enrolled in this section', {
          studentIds: unknown.map((r) => r.studentId),
        });
      }
      const requested = new Map(records.map((r) => [r.studentId, r]));

      // One row per section/date/session; the row lock serialises two teachers saving at once.
      const attendanceSession = await tx.attendanceSession.upsert({
        where: {
          instituteId_sectionId_date_session: {
            instituteId: ctx.instituteId,
            sectionId,
            date: day,
            session: sessionType,
          },
        },
        update: { markedByUserId: ctx.userId, markedAt: new Date() },
        create: {
          instituteId: ctx.instituteId,
          academicYearId: section.academicYear.id,
          sectionId,
          date: day,
          session: sessionType,
          markedByUserId: ctx.userId,
          markedAt: new Date(),
        },
        select: { id: true },
      });
      await tx.$queryRaw`SELECT id FROM attendance_sessions WHERE id = ${attendanceSession.id}::uuid FOR UPDATE`;

      const existing = new Map(
        (
          await tx.attendanceRecord.findMany({
            where: { instituteId: ctx.instituteId, attendanceSessionId: attendanceSession.id },
            select: { id: true, studentId: true, status: true, remark: true },
          })
        ).map((r) => [r.studentId, r]),
      );

      const toCreate = [];
      const changes = [];
      for (const student of roster) {
        const wanted = requested.get(student.id);
        const status =
          wanted?.status ??
          existing.get(student.id)?.status ??
          (student.onLeave ? 'on_leave' : 'present');
        const remark = wanted
          ? (wanted.remark ?? null)
          : (existing.get(student.id)?.remark ?? null);
        const before = existing.get(student.id);
        if (!before) {
          toCreate.push({
            instituteId: ctx.instituteId,
            attendanceSessionId: attendanceSession.id,
            studentId: student.id,
            date: day,
            session: sessionType,
            status,
            remark,
          });
        } else if (before.status !== status || before.remark !== remark) {
          changes.push({ student, before, status, remark });
        }
      }
      if (toCreate.length)
        await tx.attendanceRecord.createMany({ data: toCreate, skipDuplicates: true });
      for (const change of changes) {
        await tx.attendanceRecord.update({
          where: { id: change.before.id },
          data: { status: change.status, remark: change.remark },
        });
      }

      // Notify guardians only for students who became absent with this save.
      const newlyAbsent = [
        ...toCreate.filter((r) => r.status === 'absent').map((r) => r.studentId),
        ...changes.filter((c) => c.status === 'absent').map((c) => c.student.id),
      ];
      let notified = 0;
      if (newlyAbsent.length) {
        const links = await tx.studentGuardian.findMany({
          where: {
            instituteId: ctx.instituteId,
            studentId: { in: newlyAbsent },
            guardian: { userId: { not: null } },
          },
          select: { studentId: true, guardian: { select: { userId: true } } },
        });
        const names = new Map(roster.map((s) => [s.id, s.name]));
        const when = formatNoticeDate(day);
        const part = sessionType === 'full_day' ? '' : ` (${sessionType})`;
        notified = await notifyUsers(
          tx,
          ctx.instituteId,
          links.map((link) => ({
            userId: link.guardian.userId,
            type: 'attendance.absent',
            title: `${names.get(link.studentId)} was absent`,
            body: `${names.get(link.studentId)} was marked absent on ${when}${part} in ${sectionLabel(section)}. Please contact the school if this is not correct.`,
            entityType: 'student',
            entityId: link.studentId,
          })),
        );
      }

      const firstMark = existing.size === 0;
      if (firstMark || changes.length) {
        await recordAudit(tx, {
          instituteId: ctx.instituteId,
          userId: ctx.userId,
          action: firstMark ? 'attendance.mark' : 'attendance.update',
          entity: 'attendance_session',
          entityId: attendanceSession.id,
          before: firstMark
            ? undefined
            : changes.map((c) => ({
                studentId: c.student.id,
                status: c.before.status,
                remark: c.before.remark,
              })),
          after: firstMark
            ? {
                section: sectionLabel(section),
                date: formatDateOnly(day),
                session: sessionType,
                ...summarize(toCreate.map((r) => r.status)),
              }
            : changes.map((c) => ({ studentId: c.student.id, status: c.status, remark: c.remark })),
          meta,
        });
      }

      const view = await buildRosterView(tx, ctx, section, day, sessionType, settings);
      return { ...view, saved: { created: toCreate.length, changed: changes.length, notified } };
    },
    { timeout: 20_000 },
  );
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

/** Every section on one day: enrolled, whether attendance was taken, and the status counts. */
function dailyReport(ctx, { date }) {
  return withTenant(ctx.instituteId, async (tx) => {
    const day = date ?? todayIst();
    const year = await requireCurrentYear(tx, ctx.instituteId);
    const settings = await loadSettings(tx, ctx.instituteId);
    const sections = await tx.section.findMany({
      where: { instituteId: ctx.instituteId, academicYearId: year.id, isActive: true },
      orderBy: [{ level: { sortOrder: 'asc' } }, { name: 'asc' }],
      select: {
        ...SECTION_SELECT,
        classTeacher: { select: { name: true } },
        _count: { select: { enrollments: { where: { status: 'active' } } } },
      },
    });
    const sessions = await tx.attendanceSession.findMany({
      where: {
        instituteId: ctx.instituteId,
        date: day,
        sectionId: { in: sections.map((s) => s.id) },
      },
      select: { sectionId: true, records: { select: { status: true } } },
    });
    const bySection = new Map();
    for (const session of sessions) {
      const entry = bySection.get(session.sectionId) ?? { sessions: 0, statuses: [] };
      entry.sessions += 1;
      entry.statuses.push(...session.records.map((r) => r.status));
      bySection.set(session.sectionId, entry);
    }

    const rows = sections.map((section) => {
      const entry = bySection.get(section.id);
      return {
        id: section.id,
        label: sectionLabel(section),
        classTeacher: section.classTeacher?.name ?? null,
        enrolled: section._count.enrollments,
        sessionsMarked: entry?.sessions ?? 0,
        sessionsExpected: settings.sessionTypes.length,
        ...summarize(entry?.statuses ?? []),
      };
    });
    return {
      date: formatDateOnly(day),
      academicYear: year.name,
      sections: rows,
      totals: {
        sections: rows.length,
        sectionsMarked: rows.filter((r) => r.sessionsMarked > 0).length,
        ...summarize(sessions.flatMap((s) => s.records.map((r) => r.status))),
      },
    };
  });
}

function monthRange(month) {
  const [year, monthNo] = month.split('-').map(Number);
  const start = new Date(Date.UTC(year, monthNo - 1, 1));
  const end = new Date(Date.UTC(year, monthNo, 0));
  return { start, end };
}

const currentMonth = () => toLocalDateString(new Date(), env.APP_TIMEZONE).slice(0, 7);

/** A section's register for one month: one column per marked day/session, one row per student. */
function monthlyReport(ctx, { sectionId, month }) {
  return withTenant(ctx.instituteId, async (tx) => {
    const section = await findSectionOrThrow(tx, ctx.instituteId, sectionId);
    const monthKey = month ?? currentMonth();
    const { start, end } = monthRange(monthKey);

    const sessions = await tx.attendanceSession.findMany({
      where: { instituteId: ctx.instituteId, sectionId, date: { gte: start, lte: end } },
      orderBy: [{ date: 'asc' }, { session: 'asc' }],
      select: { id: true, date: true, session: true },
    });
    const records = await tx.attendanceRecord.findMany({
      where: {
        instituteId: ctx.instituteId,
        attendanceSessionId: { in: sessions.map((s) => s.id) },
      },
      select: { studentId: true, attendanceSessionId: true, status: true },
    });
    const enrollments = await tx.studentEnrollment.findMany({
      where: { instituteId: ctx.instituteId, sectionId, academicYearId: section.academicYear.id },
      orderBy: [{ rollNo: 'asc' }, { student: { firstName: 'asc' } }],
      select: {
        rollNo: true,
        status: true,
        student: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    const byStudent = new Map();
    for (const record of records) {
      const map = byStudent.get(record.studentId) ?? new Map();
      map.set(record.attendanceSessionId, record.status);
      byStudent.set(record.studentId, map);
    }
    const students = enrollments
      .filter((e) => e.status === 'active' || byStudent.has(e.student.id))
      .map((e) => {
        const marks = byStudent.get(e.student.id) ?? new Map();
        return {
          id: e.student.id,
          name: fullName(e.student),
          rollNo: e.rollNo,
          marks: sessions.map((s) => marks.get(s.id) ?? null),
          summary: summarize([...marks.values()]),
        };
      });

    return {
      section: {
        id: section.id,
        label: sectionLabel(section),
        academicYear: section.academicYear.name,
      },
      month: monthKey,
      sessions: sessions.map((s) => ({ date: formatDateOnly(s.date), session: s.session })),
      students,
      totals: summarize(records.map((r) => r.status)),
    };
  });
}

// ---------------------------------------------------------------------------
// Parent / student view
// ---------------------------------------------------------------------------

function myAttendance(ctx, { month }) {
  return withTenant(ctx.instituteId, async (tx) => {
    const student = await resolveOwnStudent(tx, ctx);
    const monthKey = month ?? currentMonth();
    const { start, end } = monthRange(monthKey);
    const records = await tx.attendanceRecord.findMany({
      where: {
        instituteId: ctx.instituteId,
        studentId: student.id,
        date: { gte: start, lte: end },
      },
      orderBy: [{ date: 'asc' }, { session: 'asc' }],
      select: { date: true, session: true, status: true, remark: true },
    });
    const yearToDate = await tx.attendanceRecord.findMany({
      where: {
        instituteId: ctx.instituteId,
        studentId: student.id,
        attendanceSession: { academicYear: { status: 'current' } },
      },
      select: { status: true },
    });
    return {
      student: { id: student.id, name: fullName(student) },
      month: monthKey,
      days: records.map((r) => ({
        date: formatDateOnly(r.date),
        session: r.session,
        status: r.status,
        remark: r.remark,
      })),
      summary: summarize(records.map((r) => r.status)),
      yearSummary: summarize(yearToDate.map((r) => r.status)),
    };
  });
}

module.exports = {
  summarize,
  listMarkableSections,
  getRoster,
  saveAttendance,
  dailyReport,
  monthlyReport,
  myAttendance,
};
