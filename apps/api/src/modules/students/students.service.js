const { randomUUID } = require('node:crypto');
const { withTenant } = require('../../lib/prisma');
const { AppError } = require('../../lib/errors');
const { recordAudit } = require('../../lib/audit');
const { toSkipTake, pageResult } = require('../../lib/pagination');
const { formatDateOnly, parseDateOnly } = require('../../lib/dates');
const { toLocalDateString } = require('../../lib/time');
const { createTemporaryCredentials } = require('../../lib/password');
const { CONSENT_PURPOSE, CONSENT_VERSION } = require('../../config/consent');
const { requireCurrentYear } = require('../academic-years/academic-years.service');
const accounts = require('../users/accounts.service');

const todayIst = () => parseDateOnly(toLocalDateString());
const fullName = (s) => [s.firstName, s.lastName].filter(Boolean).join(' ');

// Leaving statuses close the student's active enrollments with the matching status.
const ENROLLMENT_STATUS_ON_LEAVE = {
  transferred: 'transferred',
  left: 'left',
  passed_out: 'completed',
};

// ---------------------------------------------------------------------------
// Planning students with their families (shared by single create and CSV import)
// ---------------------------------------------------------------------------

/** Loads everything needed to create students with guardian and student logins. */
async function prepareFamilyContext(tx, ctx, { guardianPhones, studentPhones }) {
  const roles = await accounts.loadRoles(tx, ctx.instituteId, ['parent', 'student']);
  accounts.assertCanGrantFamilyRole(ctx, roles.get('parent'));
  if (studentPhones.length) accounts.assertCanGrantFamilyRole(ctx, roles.get('student'));
  return {
    roles,
    users: await accounts.loadUsersByPhone(tx, ctx.instituteId, [
      ...guardianPhones,
      ...studentPhones,
    ]),
    guardians: await accounts.loadGuardiansByPhone(tx, ctx.instituteId, guardianPhones),
  };
}

/** Problems with a row that depend on existing logins. Returns [{ column, message }]. */
function familyConflicts(
  row,
  family,
  columns = { studentPhone: 'student_phone', guardianPhone: 'guardian_phone' },
) {
  const errors = [];
  if (row.studentPhone && family.users.has(row.studentPhone)) {
    errors.push({
      column: columns.studentPhone,
      message: 'This mobile number already has a login',
    });
  }
  for (const guardian of row.guardians) {
    if (family.users.get(guardian.phone)?.studentId) {
      errors.push({
        column: guardian.column ?? columns.guardianPhone,
        message: "This mobile number is a student's own login",
      });
    }
  }
  return errors;
}

/**
 * Adds one student (with enrollment, guardians and logins) to the batch. Guardians are matched by
 * mobile number, which links siblings automatically.
 */
function planStudent(batch, { family, academicYearId, row, takeCredential, stats }) {
  const studentId = randomUUID();
  let userId = null;
  if (row.studentPhone) {
    userId = accounts.ensureAccount(batch, {
      phone: row.studentPhone,
      name: fullName(row.student),
      role: family.roles.get('student'),
      users: family.users,
      takeCredential,
    }).userId;
    family.users.get(row.studentPhone).studentId = studentId;
  }

  batch.students.push({
    id: studentId,
    instituteId: batch.instituteId,
    academicYearId,
    userId,
    ...row.student,
  });
  if (row.sectionId) {
    batch.enrollments.push({
      instituteId: batch.instituteId,
      studentId,
      academicYearId,
      sectionId: row.sectionId,
      rollNo: row.rollNo ?? null,
      enrolledOn: row.student.admissionDate ?? todayIst(),
    });
  }

  for (const guardianRow of row.guardians) {
    let guardian = family.guardians.get(guardianRow.phone);
    const account = accounts.ensureAccount(batch, {
      phone: guardianRow.phone,
      name: guardianRow.name,
      role: family.roles.get('parent'),
      users: family.users,
      takeCredential,
    });
    if (account.created) stats.usersCreated += 1;

    if (!guardian) {
      guardian = {
        id: randomUUID(),
        phone: guardianRow.phone,
        userId: account.userId,
        isNew: true,
      };
      batch.guardians.push({
        id: guardian.id,
        instituteId: batch.instituteId,
        userId: account.userId,
        name: guardianRow.name,
        phone: guardianRow.phone,
        email: guardianRow.email ?? null,
        occupation: guardianRow.occupation ?? null,
      });
      family.guardians.set(guardian.phone, guardian);
      stats.guardiansCreated += 1;
    } else {
      if (!guardian.userId) {
        batch.guardianLogins.push({ guardianId: guardian.id, userId: account.userId });
        guardian.userId = account.userId;
      }
      stats.siblingLinks += 1;
    }

    batch.studentGuardians.push({
      instituteId: batch.instituteId,
      studentId,
      guardianId: guardian.id,
      relation: guardianRow.relation,
      isPrimary: guardianRow.isPrimary,
      isFeePayer: guardianRow.isFeePayer,
    });
  }
  if (userId) stats.usersCreated += 1;
  stats.studentsCreated += 1;
  return studentId;
}

const newStats = () => ({
  studentsCreated: 0,
  guardiansCreated: 0,
  siblingLinks: 0,
  usersCreated: 0,
});

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

const currentEnrollment = (academicYearId) => ({
  where: { academicYearId },
  take: 1,
  select: {
    rollNo: true,
    status: true,
    section: { select: { id: true, name: true, level: { select: { id: true, name: true } } } },
  },
});

function toListView(student) {
  const enrollment = student.enrollments[0] ?? null;
  const primary = student.guardians.find((g) => g.isPrimary) ?? student.guardians[0];
  return {
    id: student.id,
    admissionNo: student.admissionNo,
    name: fullName(student),
    firstName: student.firstName,
    lastName: student.lastName,
    gender: student.gender,
    dateOfBirth: formatDateOnly(student.dateOfBirth),
    status: student.status,
    hasLogin: Boolean(student.userId),
    enrollment: enrollment && {
      rollNo: enrollment.rollNo,
      status: enrollment.status,
      section: enrollment.section,
    },
    primaryGuardian: primary
      ? {
          id: primary.guardian.id,
          name: primary.guardian.name,
          phone: primary.guardian.phone,
          relation: primary.relation,
        }
      : null,
  };
}

function listStudents(ctx, { page, limit, q, academicYearId, levelId, sectionId, status, gender }) {
  return withTenant(ctx.instituteId, async (tx) => {
    const yearId = academicYearId ?? (await requireCurrentYear(tx, ctx.instituteId)).id;
    const digits = q?.replace(/\D/g, '') ?? '';
    const placement =
      sectionId || levelId
        ? {
            enrollments: {
              some: {
                academicYearId: yearId,
                ...(sectionId ? { sectionId } : {}),
                ...(levelId ? { section: { levelId } } : {}),
              },
            },
          }
        : {};
    const where = {
      instituteId: ctx.instituteId,
      ...(status === 'all' ? {} : { status }),
      ...(gender ? { gender } : {}),
      ...placement,
      ...(q
        ? {
            OR: [
              { firstName: { contains: q, mode: 'insensitive' } },
              { lastName: { contains: q, mode: 'insensitive' } },
              { admissionNo: { contains: q, mode: 'insensitive' } },
              ...(digits.length >= 4
                ? [{ guardians: { some: { guardian: { phone: { contains: digits } } } } }]
                : []),
            ],
          }
        : {}),
    };
    const students = await tx.student.findMany({
      where,
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      select: {
        id: true,
        admissionNo: true,
        firstName: true,
        lastName: true,
        gender: true,
        dateOfBirth: true,
        status: true,
        userId: true,
        enrollments: currentEnrollment(yearId),
        guardians: {
          select: {
            relation: true,
            isPrimary: true,
            guardian: { select: { id: true, name: true, phone: true } },
          },
        },
      },
      ...toSkipTake({ page, limit }),
    });
    const total = await tx.student.count({ where });
    return {
      ...pageResult(students.map(toListView), total, { page, limit }),
      academicYearId: yearId,
    };
  });
}

async function loadStudentProfile(tx, instituteId, id) {
  const student = await tx.student.findFirst({
    where: { id, instituteId },
    select: {
      id: true,
      admissionNo: true,
      firstName: true,
      lastName: true,
      gender: true,
      dateOfBirth: true,
      bloodGroup: true,
      admissionDate: true,
      address: true,
      status: true,
      statusReason: true,
      createdAt: true,
      admissionYear: { select: { id: true, name: true } },
      user: { select: { id: true, phone: true, status: true, lastLoginAt: true } },
      enrollments: {
        orderBy: { academicYear: { startDate: 'desc' } },
        select: {
          id: true,
          rollNo: true,
          status: true,
          enrolledOn: true,
          leftOn: true,
          academicYear: { select: { id: true, name: true, status: true } },
          section: {
            select: { id: true, name: true, level: { select: { id: true, name: true } } },
          },
        },
      },
      guardians: {
        orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
        select: {
          relation: true,
          isPrimary: true,
          isFeePayer: true,
          guardian: {
            select: {
              id: true,
              name: true,
              phone: true,
              email: true,
              occupation: true,
              userId: true,
            },
          },
        },
      },
    },
  });
  if (!student) throw AppError.notFound('Student not found');

  const guardianIds = student.guardians.map((g) => g.guardian.id);
  const siblingLinks = await tx.studentGuardian.findMany({
    where: { instituteId, guardianId: { in: guardianIds }, studentId: { not: id } },
    select: {
      student: {
        select: { id: true, firstName: true, lastName: true, admissionNo: true, status: true },
      },
    },
  });
  const siblings = [
    ...new Map(siblingLinks.map((link) => [link.student.id, link.student])).values(),
  ];

  const consents = await tx.consent.findMany({
    where: {
      instituteId,
      studentId: id,
      purpose: CONSENT_PURPOSE,
      version: CONSENT_VERSION,
      withdrawnAt: null,
    },
    select: { guardianId: true, grantedAt: true },
  });
  const consentByGuardian = new Map(consents.map((c) => [c.guardianId, c.grantedAt]));

  return {
    id: student.id,
    admissionNo: student.admissionNo,
    name: fullName(student),
    firstName: student.firstName,
    lastName: student.lastName,
    gender: student.gender,
    dateOfBirth: formatDateOnly(student.dateOfBirth),
    bloodGroup: student.bloodGroup,
    admissionDate: formatDateOnly(student.admissionDate),
    address: student.address,
    status: student.status,
    statusReason: student.statusReason,
    admissionYear: student.admissionYear,
    login: student.user,
    enrollments: student.enrollments.map((e) => ({
      ...e,
      enrolledOn: formatDateOnly(e.enrolledOn),
      leftOn: formatDateOnly(e.leftOn),
    })),
    guardians: student.guardians.map((g) => ({
      id: g.guardian.id,
      name: g.guardian.name,
      phone: g.guardian.phone,
      email: g.guardian.email,
      occupation: g.guardian.occupation,
      hasLogin: Boolean(g.guardian.userId),
      relation: g.relation,
      isPrimary: g.isPrimary,
      isFeePayer: g.isFeePayer,
      consentGivenAt: consentByGuardian.get(g.guardian.id) ?? null,
    })),
    siblings: siblings.map((s) => ({
      id: s.id,
      name: fullName(s),
      admissionNo: s.admissionNo,
      status: s.status,
    })),
  };
}

function getStudent(ctx, id) {
  return withTenant(ctx.instituteId, (tx) => loadStudentProfile(tx, ctx.instituteId, id));
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

async function assertSectionInYear(tx, instituteId, sectionId, academicYearId) {
  const section = await tx.section.findFirst({
    where: { id: sectionId, instituteId, academicYearId },
    select: { id: true },
  });
  if (!section) throw AppError.badRequest('This section is not part of the selected academic year');
}

function normalizeGuardians(guardians) {
  const phones = guardians.map((g) => g.phone);
  if (new Set(phones).size !== phones.length) {
    throw AppError.badRequest('Each guardian needs a different mobile number');
  }
  const hasPrimary = guardians.some((g) => g.isPrimary);
  const hasPayer = guardians.some((g) => g.isFeePayer);
  return guardians.map((g, index) => ({
    ...g,
    isPrimary: hasPrimary ? Boolean(g.isPrimary) : index === 0,
    isFeePayer: hasPayer ? Boolean(g.isFeePayer) : index === 0,
  }));
}

/**
 * Creates a student with enrollment, guardians (reused by phone = sibling link) and logins.
 * New logins get temporary passwords, returned once in `credentials`.
 */
async function createStudent(ctx, body, meta) {
  const guardians = normalizeGuardians(body.guardians);
  if (body.studentPhone && guardians.some((g) => g.phone === body.studentPhone)) {
    throw AppError.badRequest("The student's login number must differ from the guardians' numbers");
  }
  const phones = [
    ...guardians.map((g) => g.phone),
    ...(body.studentPhone ? [body.studentPhone] : []),
  ];
  const pool = await createTemporaryCredentials(
    await withTenant(ctx.instituteId, (tx) =>
      accounts.countPhonesWithoutLogin(tx, ctx.instituteId, phones),
    ),
  );

  return withTenant(ctx.instituteId, async (tx) => {
    const academicYearId =
      body.academicYearId ?? (await requireCurrentYear(tx, ctx.instituteId)).id;
    if (body.sectionId)
      await assertSectionInYear(tx, ctx.instituteId, body.sectionId, academicYearId);

    const family = await prepareFamilyContext(tx, ctx, {
      guardianPhones: guardians.map((g) => g.phone),
      studentPhones: body.studentPhone ? [body.studentPhone] : [],
    });
    const row = {
      student: body.student,
      sectionId: body.sectionId ?? null,
      rollNo: body.rollNo ?? null,
      studentPhone: body.studentPhone ?? null,
      guardians,
    };
    const conflicts = familyConflicts(row, family);
    if (conflicts.length) throw AppError.conflict(conflicts[0].message, conflicts);

    const batch = accounts.createBatch(ctx.instituteId);
    const stats = newStats();
    const studentId = planStudent(batch, {
      family,
      academicYearId,
      row,
      takeCredential: accounts.credentialSource(pool),
      stats,
    });
    await accounts.flushBatch(tx, batch);

    const profile = await loadStudentProfile(tx, ctx.instituteId, studentId);
    await recordAudit(tx, {
      instituteId: ctx.instituteId,
      userId: ctx.userId,
      action: 'student.create',
      entity: 'student',
      entityId: studentId,
      after: { admissionNo: profile.admissionNo, name: profile.name, stats },
      meta,
    });
    return { student: profile, credentials: batch.credentials };
  });
}

const EDITABLE_FIELDS = [
  'admissionNo',
  'firstName',
  'lastName',
  'gender',
  'dateOfBirth',
  'bloodGroup',
  'admissionDate',
  'address',
];

function updateStudent(ctx, id, changes, meta) {
  return withTenant(ctx.instituteId, async (tx) => {
    const before = await loadStudentProfile(tx, ctx.instituteId, id);
    await tx.student.update({ where: { id }, data: changes });
    const after = await loadStudentProfile(tx, ctx.instituteId, id);
    const changed = EDITABLE_FIELDS.filter((field) => changes[field] !== undefined);
    await recordAudit(tx, {
      instituteId: ctx.instituteId,
      userId: ctx.userId,
      action: 'student.update',
      entity: 'student',
      entityId: id,
      before: Object.fromEntries(changed.map((f) => [f, before[f]])),
      after: Object.fromEntries(changed.map((f) => [f, after[f]])),
      meta,
    });
    return after;
  });
}

/** Soft delete / restore. Leaving closes active enrollments; the student's own login follows. */
function changeStatus(ctx, id, { status, reason }, meta) {
  return withTenant(ctx.instituteId, async (tx) => {
    const before = await loadStudentProfile(tx, ctx.instituteId, id);
    await tx.student.update({ where: { id }, data: { status, statusReason: reason ?? null } });

    const enrollmentStatus = ENROLLMENT_STATUS_ON_LEAVE[status];
    if (enrollmentStatus) {
      await tx.studentEnrollment.updateMany({
        where: { instituteId: ctx.instituteId, studentId: id, status: 'active' },
        data: { status: enrollmentStatus, leftOn: todayIst() },
      });
    }
    if (before.login) {
      await tx.user.update({
        where: { id: before.login.id },
        data: { status: status === 'active' ? 'active' : 'disabled' },
      });
      if (status !== 'active') {
        await tx.refreshToken.updateMany({
          where: { instituteId: ctx.instituteId, userId: before.login.id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
    }

    await recordAudit(tx, {
      instituteId: ctx.instituteId,
      userId: ctx.userId,
      action: 'student.status_change',
      entity: 'student',
      entityId: id,
      before: { status: before.status, reason: before.statusReason },
      after: { status, reason: reason ?? null },
      meta,
    });
    return loadStudentProfile(tx, ctx.instituteId, id);
  });
}

/** Places the student in a section for an academic year (creates or moves the enrollment). */
function setEnrollment(ctx, id, { academicYearId, sectionId, rollNo, status }, meta) {
  return withTenant(ctx.instituteId, async (tx) => {
    const yearId = academicYearId ?? (await requireCurrentYear(tx, ctx.instituteId)).id;
    const before = await loadStudentProfile(tx, ctx.instituteId, id);
    await assertSectionInYear(tx, ctx.instituteId, sectionId, yearId);

    const data = { sectionId, rollNo: rollNo ?? null, ...(status ? { status } : {}) };
    await tx.studentEnrollment.upsert({
      where: {
        instituteId_academicYearId_studentId: {
          instituteId: ctx.instituteId,
          academicYearId: yearId,
          studentId: id,
        },
      },
      update: data,
      create: {
        instituteId: ctx.instituteId,
        studentId: id,
        academicYearId: yearId,
        enrolledOn: todayIst(),
        ...data,
      },
    });

    const after = await loadStudentProfile(tx, ctx.instituteId, id);
    const summary = (profile) =>
      profile.enrollments
        .filter((e) => e.academicYear.id === yearId)
        .map((e) => ({
          section: `${e.section.level.name} ${e.section.name}`,
          rollNo: e.rollNo,
          status: e.status,
        }))[0] ?? null;
    await recordAudit(tx, {
      instituteId: ctx.instituteId,
      userId: ctx.userId,
      action: 'student.enrollment_update',
      entity: 'student',
      entityId: id,
      before: summary(before),
      after: summary(after),
      meta,
    });
    return after;
  });
}

/** Links a guardian by mobile number (existing guardian = sibling link), creating a login if needed. */
async function addGuardian(ctx, studentId, guardianInput, meta) {
  const pool = await createTemporaryCredentials(
    await withTenant(ctx.instituteId, (tx) =>
      accounts.countPhonesWithoutLogin(tx, ctx.instituteId, [guardianInput.phone]),
    ),
  );
  return withTenant(ctx.instituteId, async (tx) => {
    const profile = await loadStudentProfile(tx, ctx.instituteId, studentId);
    if (profile.guardians.some((g) => g.phone === guardianInput.phone)) {
      throw AppError.conflict('This guardian is already linked to the student');
    }
    const family = await prepareFamilyContext(tx, ctx, {
      guardianPhones: [guardianInput.phone],
      studentPhones: [],
    });
    const conflicts = familyConflicts({ studentPhone: null, guardians: [guardianInput] }, family, {
      guardianPhone: 'phone',
    });
    if (conflicts.length) throw AppError.conflict(conflicts[0].message, conflicts);

    const batch = accounts.createBatch(ctx.instituteId);
    const stats = newStats();
    let guardian = family.guardians.get(guardianInput.phone);
    const account = accounts.ensureAccount(batch, {
      phone: guardianInput.phone,
      name: guardianInput.name,
      role: family.roles.get('parent'),
      users: family.users,
      takeCredential: accounts.credentialSource(pool),
    });
    if (!guardian) {
      guardian = { id: randomUUID(), userId: account.userId };
      batch.guardians.push({
        id: guardian.id,
        instituteId: ctx.instituteId,
        userId: account.userId,
        name: guardianInput.name,
        phone: guardianInput.phone,
        email: guardianInput.email ?? null,
        occupation: guardianInput.occupation ?? null,
      });
      stats.guardiansCreated += 1;
    } else if (!guardian.userId) {
      batch.guardianLogins.push({ guardianId: guardian.id, userId: account.userId });
    }
    if (guardianInput.isPrimary) {
      await tx.studentGuardian.updateMany({
        where: { instituteId: ctx.instituteId, studentId },
        data: { isPrimary: false },
      });
    }
    batch.studentGuardians.push({
      instituteId: ctx.instituteId,
      studentId,
      guardianId: guardian.id,
      relation: guardianInput.relation,
      isPrimary: Boolean(guardianInput.isPrimary),
      isFeePayer: Boolean(guardianInput.isFeePayer),
    });
    await accounts.flushBatch(tx, batch);

    await recordAudit(tx, {
      instituteId: ctx.instituteId,
      userId: ctx.userId,
      action: 'student.guardian_link',
      entity: 'student',
      entityId: studentId,
      after: {
        guardianId: guardian.id,
        phone: guardianInput.phone,
        relation: guardianInput.relation,
      },
      meta,
    });
    return {
      student: await loadStudentProfile(tx, ctx.instituteId, studentId),
      credentials: batch.credentials,
    };
  });
}

function updateGuardianLink(ctx, studentId, guardianId, changes, meta) {
  return withTenant(ctx.instituteId, async (tx) => {
    const link = await tx.studentGuardian.findFirst({
      where: { instituteId: ctx.instituteId, studentId, guardianId },
      select: { id: true, relation: true, isPrimary: true, isFeePayer: true },
    });
    if (!link) throw AppError.notFound('This guardian is not linked to the student');
    if (changes.isPrimary) {
      await tx.studentGuardian.updateMany({
        where: { instituteId: ctx.instituteId, studentId, id: { not: link.id } },
        data: { isPrimary: false },
      });
    }
    await tx.studentGuardian.update({ where: { id: link.id }, data: changes });
    await recordAudit(tx, {
      instituteId: ctx.instituteId,
      userId: ctx.userId,
      action: 'student.guardian_update',
      entity: 'student',
      entityId: studentId,
      before: {
        guardianId,
        relation: link.relation,
        isPrimary: link.isPrimary,
        isFeePayer: link.isFeePayer,
      },
      after: { guardianId, ...changes },
      meta,
    });
    return loadStudentProfile(tx, ctx.instituteId, studentId);
  });
}

function removeGuardianLink(ctx, studentId, guardianId, meta) {
  return withTenant(ctx.instituteId, async (tx) => {
    const profile = await loadStudentProfile(tx, ctx.instituteId, studentId);
    if (!profile.guardians.some((g) => g.id === guardianId)) {
      throw AppError.notFound('This guardian is not linked to the student');
    }
    if (profile.guardians.length === 1) {
      throw AppError.conflict('A student must keep at least one guardian');
    }
    await tx.studentGuardian.deleteMany({
      where: { instituteId: ctx.instituteId, studentId, guardianId },
    });
    await recordAudit(tx, {
      instituteId: ctx.instituteId,
      userId: ctx.userId,
      action: 'student.guardian_unlink',
      entity: 'student',
      entityId: studentId,
      before: { guardianId },
      meta,
    });
    return loadStudentProfile(tx, ctx.instituteId, studentId);
  });
}

module.exports = {
  prepareFamilyContext,
  familyConflicts,
  planStudent,
  newStats,
  listStudents,
  getStudent,
  createStudent,
  updateStudent,
  changeStatus,
  setEnrollment,
  addGuardian,
  updateGuardianLink,
  removeGuardianLink,
};
