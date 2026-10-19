const { CONSENT_PURPOSE, CONSENT_VERSION } = require('../../config/consent');

/**
 * A profile is one way a user can act: a role plus the record it acts as. Staff roles act as the
 * user's staff record, "student" as the user's own student record, and "parent" once per child, so a
 * parent of siblings (or a teacher who is also a parent) picks who they are working with.
 */

// Lower index = shown first and chosen by default at login. Custom roles sit between staff and family.
const ROLE_ORDER = ['admin', 'accountant', 'front_office', 'teacher'];
const FAMILY_ROLES = ['parent', 'student'];

function rank(roleCode) {
  const staffIndex = ROLE_ORDER.indexOf(roleCode);
  if (staffIndex >= 0) return staffIndex;
  const familyIndex = FAMILY_ROLES.indexOf(roleCode);
  return familyIndex >= 0 ? 100 + familyIndex : 50;
}

const studentName = (student) => [student.firstName, student.lastName].filter(Boolean).join(' ');

const STUDENT_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  status: true,
  enrollments: {
    where: { status: 'active' },
    orderBy: { createdAt: 'desc' },
    take: 1,
    select: { section: { select: { name: true, level: { select: { name: true } } } } },
  },
};

function classLabel(student) {
  const section = student.enrollments[0]?.section;
  return section ? `${section.level.name} - ${section.name}` : null;
}

function profileKey(roleId, profileId) {
  return `${roleId}:${profileId ?? ''}`;
}

/** All profiles available to a user, in display order. */
async function listProfiles(tx, { instituteId, userId }) {
  const assignments = await tx.userRole.findMany({
    where: { instituteId, userId },
    select: { role: { select: { id: true, code: true, name: true } } },
  });
  const staff = await tx.staff.findFirst({
    where: { instituteId, userId },
    select: { id: true },
  });
  const ownStudent = await tx.student.findFirst({
    where: { instituteId, userId },
    select: STUDENT_SELECT,
  });
  const guardian = await tx.guardian.findFirst({
    where: { instituteId, userId },
    select: {
      id: true,
      students: {
        where: { student: { status: 'active' } },
        orderBy: { student: { firstName: 'asc' } },
        select: { student: { select: STUDENT_SELECT } },
      },
    },
  });

  const profiles = [];
  for (const { role } of assignments) {
    const base = { roleId: role.id, roleCode: role.code, roleName: role.name };

    if (role.code === 'parent') {
      for (const { student } of guardian?.students ?? []) {
        profiles.push({
          ...base,
          type: 'student',
          id: student.id,
          label: studentName(student),
          detail: classLabel(student),
        });
      }
    } else if (role.code === 'student') {
      if (ownStudent) {
        profiles.push({
          ...base,
          type: 'student',
          id: ownStudent.id,
          label: studentName(ownStudent),
          detail: classLabel(ownStudent),
        });
      }
    } else {
      profiles.push({
        ...base,
        type: staff ? 'staff' : null,
        id: staff?.id ?? null,
        label: role.name,
        detail: null,
      });
    }
  }

  return profiles
    .map((profile) => ({ key: profileKey(profile.roleId, profile.id), ...profile }))
    .sort((a, b) => rank(a.roleCode) - rank(b.roleCode) || a.label.localeCompare(b.label));
}

/** The guardian's active children who have not consented to the current consent version. */
async function studentsAwaitingConsent(tx, { instituteId, userId }) {
  const guardian = await tx.guardian.findFirst({
    where: { instituteId, userId },
    select: {
      id: true,
      students: {
        where: { student: { status: 'active' } },
        select: { student: { select: STUDENT_SELECT } },
      },
    },
  });
  if (!guardian) return { guardianId: null, students: [] };

  const consented = await tx.consent.findMany({
    where: {
      instituteId,
      guardianId: guardian.id,
      purpose: CONSENT_PURPOSE,
      version: CONSENT_VERSION,
      withdrawnAt: null,
    },
    select: { studentId: true },
  });
  const done = new Set(consented.map((row) => row.studentId));

  return {
    guardianId: guardian.id,
    students: guardian.students
      .map(({ student }) => student)
      .filter((student) => !done.has(student.id))
      .map((student) => ({
        id: student.id,
        name: studentName(student),
        detail: classLabel(student),
      })),
  };
}

/** Parents must give DPDP consent before using the app; other roles never need to. */
async function isConsentPending(tx, { instituteId, userId, profile }) {
  if (profile.roleCode !== 'parent') return false;
  const { students } = await studentsAwaitingConsent(tx, { instituteId, userId });
  return students.length > 0;
}

module.exports = { listProfiles, profileKey, studentsAwaitingConsent, isConsentPending };
