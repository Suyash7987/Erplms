/**
 * Demo data: one institute with system roles, the 2026-27 academic year, Classes 1-12 (sections A and B),
 * subjects, staff (admin, accountant, front office, teachers), 20 students and their guardians.
 *
 * Run with `npm run db:seed` (or automatically by `npm run db:reset`). Demo passwords are printed at
 * the end. Re-running only syncs the permission catalog and every institute's system roles.
 */
const { randomUUID } = require('node:crypto');
const { prisma, withTenant, withPlatform } = require('../src/lib/prisma');
const { hashPassword } = require('../src/lib/password');
const { syncPermissionCatalog, syncSystemRoles } = require('../src/modules/roles/roles.service');

const DEMO_SLUG = 'demo';

const PASSWORDS = {
  admin: 'Admin@1234',
  accountant: 'Accounts@1234',
  front_office: 'Office@1234',
  teacher: 'Teacher@1234',
  parent: 'Parent@1234',
  student: 'Student@1234',
};

const BANDS = { 1: 'primary', 6: 'middle', 9: 'secondary', 11: 'senior' };

const SUBJECTS = [
  { code: 'ENG', name: 'English' },
  { code: 'HIN', name: 'Hindi' },
  { code: 'MATH', name: 'Mathematics' },
  { code: 'EVS', name: 'Environmental Studies' },
  { code: 'SCI', name: 'Science' },
  { code: 'SST', name: 'Social Science' },
  { code: 'COMP', name: 'Computer Science' },
];

const TEACHERS = [
  { phone: '9000000011', name: 'Anita Sharma', code: 'EMP011', classTeacherOf: 1 },
  { phone: '9000000012', name: 'Vikram Singh', code: 'EMP012', classTeacherOf: 5 },
  { phone: '9000000013', name: 'Farah Khan', code: 'EMP013', classTeacherOf: 6 },
  { phone: '9000000014', name: 'Suresh Reddy', code: 'EMP014', classTeacherOf: 10 },
];

// Students are placed in section A of these classes.
const SAMPLE_CLASSES = [1, 5, 6, 10];

const STUDENT_NAMES = [
  ['Aarav', 'Patel', 'male'],
  ['Diya', 'Mehta', 'female'],
  ['Kabir', 'Joshi', 'male'],
  ['Ananya', 'Rao', 'female'],
  ['Vihaan', 'Das', 'male'],
  ['Ishita', 'Patel', 'female'],
  ['Arjun', 'Nair', 'male'],
  ['Saanvi', 'Kulkarni', 'female'],
  ['Reyansh', 'Bose', 'male'],
  ['Myra', 'Chopra', 'female'],
  ['Rohan', 'Sharma', 'male'],
  ['Aadhya', 'Pillai', 'female'],
  ['Krishna', 'Yadav', 'male'],
  ['Kiara', 'Menon', 'female'],
  ['Atharv', 'Desai', 'male'],
  ['Navya', 'Saxena', 'female'],
  ['Shaurya', 'Mishra', 'male'],
  ['Anika', 'Ghosh', 'female'],
  ['Dhruv', 'Bhat', 'male'],
  ['Prisha', 'Agarwal', 'female'],
];

const date = (isoDate) => new Date(`${isoDate}T00:00:00.000Z`);

async function hashDemoPasswords() {
  const entries = await Promise.all(
    Object.entries(PASSWORDS).map(async ([key, plain]) => [key, await hashPassword(plain)]),
  );
  return Object.fromEntries(entries);
}

async function seedInstitute(tx, instituteId, permissionIds, hashes) {
  await tx.institute.create({
    data: {
      id: instituteId,
      name: 'Demo Public School',
      slug: DEMO_SLUG,
      board: 'CBSE',
      boardName: 'Central Board of Secondary Education',
      phone: '9000000000',
      email: 'office@demo-school.example',
      addressLine: '12 MG Road',
      city: 'Pune',
      state: 'Maharashtra',
      pincode: '411001',
      settings: {
        locale: 'en',
        labels: { level: 'Class', section: 'Section', student: 'Student', guardian: 'Parent' },
        attendance: { editWindowDays: 2, sessionsPerDay: 1 },
        fees: { receiptPrefix: 'DPS' },
      },
    },
  });

  const roleIds = await syncSystemRoles(tx, instituteId, permissionIds);

  async function createUser({ phone, name, roles, passwordKey }) {
    const user = await tx.user.create({
      data: {
        instituteId,
        phone,
        name,
        passwordHash: hashes[passwordKey],
        // Demo accounts skip the forced change so you can log straight in.
        mustChangePassword: false,
      },
      select: { id: true },
    });
    await tx.userRole.createMany({
      data: roles.map((code) => ({ instituteId, userId: user.id, roleId: roleIds[code] })),
    });
    return user.id;
  }

  async function addRole(userId, code) {
    await tx.userRole.create({ data: { instituteId, userId, roleId: roleIds[code] } });
  }

  // Academic year
  const academicYearId = randomUUID();
  await tx.academicYear.create({
    data: {
      id: academicYearId,
      instituteId,
      name: '2026-27',
      startDate: date('2026-04-01'),
      endDate: date('2027-03-31'),
      status: 'current',
    },
  });
  await tx.receiptSequence.create({
    data: { instituteId, academicYearId, prefix: 'DPS/2026-27/' },
  });

  // Levels (Class 1-12) and sections A/B
  const levelIds = {};
  let band = 'primary';
  for (let classNo = 1; classNo <= 12; classNo += 1) {
    band = BANDS[classNo] ?? band;
    const levelId = randomUUID();
    levelIds[classNo] = levelId;
    await tx.level.create({
      data: {
        id: levelId,
        instituteId,
        name: `Class ${classNo}`,
        code: String(classNo),
        band,
        sortOrder: classNo,
      },
    });
  }

  const sectionIds = {};
  for (let classNo = 1; classNo <= 12; classNo += 1) {
    for (const name of ['A', 'B']) {
      const sectionId = randomUUID();
      sectionIds[`${classNo}${name}`] = sectionId;
      await tx.section.create({
        data: {
          id: sectionId,
          instituteId,
          academicYearId,
          levelId: levelIds[classNo],
          name,
          capacity: 40,
          room: `${classNo}${name}`,
        },
      });
    }
  }

  // Subjects
  const subjectIds = {};
  for (const subject of SUBJECTS) {
    const subjectId = randomUUID();
    subjectIds[subject.code] = subjectId;
    await tx.subject.create({ data: { id: subjectId, instituteId, ...subject } });
  }

  // Office staff
  const office = [
    {
      phone: '9000000001',
      name: 'Meera Iyer',
      code: 'EMP001',
      role: 'admin',
      designation: 'Principal',
    },
    {
      phone: '9000000002',
      name: 'Rakesh Gupta',
      code: 'EMP002',
      role: 'accountant',
      designation: 'Accountant',
    },
    {
      phone: '9000000003',
      name: 'Pooja Nair',
      code: 'EMP003',
      role: 'front_office',
      designation: 'Front office executive',
    },
  ];
  for (const person of office) {
    const userId = await createUser({
      phone: person.phone,
      name: person.name,
      roles: [person.role],
      passwordKey: person.role,
    });
    await tx.staff.create({
      data: {
        instituteId,
        userId,
        employeeCode: person.code,
        name: person.name,
        phone: person.phone,
        designation: person.designation,
        staffType: 'non_teaching',
        joiningDate: date('2020-06-01'),
      },
    });
  }

  // Teachers, class teachers and subject mapping for the sample sections
  const teacherStaffIds = [];
  const teacherUserIds = {};
  for (const teacher of TEACHERS) {
    const userId = await createUser({
      phone: teacher.phone,
      name: teacher.name,
      roles: ['teacher'],
      passwordKey: 'teacher',
    });
    teacherUserIds[teacher.phone] = userId;
    const staff = await tx.staff.create({
      data: {
        instituteId,
        userId,
        employeeCode: teacher.code,
        name: teacher.name,
        phone: teacher.phone,
        designation: 'Teacher',
        staffType: 'teaching',
        joiningDate: date('2021-06-01'),
      },
      select: { id: true },
    });
    teacherStaffIds.push(staff.id);
    await tx.section.update({
      where: { id: sectionIds[`${teacher.classTeacherOf}A`] },
      data: { classTeacherStaffId: staff.id },
    });
  }

  for (const classNo of SAMPLE_CLASSES) {
    const codes =
      classNo <= 5 ? ['ENG', 'HIN', 'MATH', 'EVS'] : ['ENG', 'HIN', 'MATH', 'SCI', 'SST'];
    await tx.sectionSubject.createMany({
      data: codes.map((code, index) => ({
        instituteId,
        sectionId: sectionIds[`${classNo}A`],
        subjectId: subjectIds[code],
        teacherStaffId: teacherStaffIds[index % teacherStaffIds.length],
      })),
    });
  }

  // Students, enrollments and guardians
  const sharedGuardian = { name: 'Ramesh Patel', phone: '9000000101' }; // sibling case
  let sharedGuardianId = null;
  let guardianPhone = 101;
  let studentPhone = 201;
  const examples = {};

  for (let i = 0; i < STUDENT_NAMES.length; i += 1) {
    const [firstName, lastName, gender] = STUDENT_NAMES[i];
    const classNo = SAMPLE_CLASSES[Math.floor(i / 5)];
    const rollNo = (i % 5) + 1;

    let userId = null;
    if (classNo === 10) {
      const phone = `9000000${studentPhone}`;
      studentPhone += 1;
      userId = await createUser({
        phone,
        name: `${firstName} ${lastName}`,
        roles: ['student'],
        passwordKey: 'student',
      });
      examples.student ??= { phone, name: `${firstName} ${lastName} (Class 10-A)` };
    }

    const student = await tx.student.create({
      data: {
        instituteId,
        academicYearId,
        admissionNo: `ADM2026${String(i + 1).padStart(3, '0')}`,
        userId,
        firstName,
        lastName,
        gender,
        dateOfBirth: date(`${2026 - classNo - 5}-0${(i % 9) + 1}-15`),
        admissionDate: date('2026-04-01'),
      },
      select: { id: true },
    });
    await tx.studentEnrollment.create({
      data: {
        instituteId,
        studentId: student.id,
        academicYearId,
        sectionId: sectionIds[`${classNo}A`],
        rollNo,
        enrolledOn: date('2026-04-01'),
      },
    });

    let guardianId;
    let relation = gender === 'male' ? 'father' : 'mother';
    const isSibling = lastName === 'Patel'; // Aarav (Class 1) and Ishita (Class 5)
    const isTeacherChild = classNo === 6 && rollNo === 1; // Rohan's parent is teacher Anita Sharma

    if (isSibling) {
      relation = 'father';
      if (!sharedGuardianId) {
        const guardianUserId = await createUser({
          ...sharedGuardian,
          roles: ['parent'],
          passwordKey: 'parent',
        });
        const guardian = await tx.guardian.create({
          data: { instituteId, userId: guardianUserId, ...sharedGuardian, occupation: 'Business' },
          select: { id: true },
        });
        sharedGuardianId = guardian.id;
        guardianPhone += 1;
        examples.siblingParent = {
          phone: sharedGuardian.phone,
          name: `${sharedGuardian.name} (2 children)`,
        };
      }
      guardianId = sharedGuardianId;
    } else if (isTeacherChild) {
      relation = 'mother';
      const teacher = TEACHERS[0];
      const teacherUserId = teacherUserIds[teacher.phone];
      await addRole(teacherUserId, 'parent');
      const guardian = await tx.guardian.create({
        data: {
          instituteId,
          userId: teacherUserId,
          name: teacher.name,
          phone: teacher.phone,
          occupation: 'Teacher',
        },
        select: { id: true },
      });
      guardianId = guardian.id;
      examples.teacherParent = { phone: teacher.phone, name: `${teacher.name} (teacher + parent)` };
    } else {
      const phone = `9000000${guardianPhone}`;
      guardianPhone += 1;
      const name = `${relation === 'father' ? 'Mr.' : 'Mrs.'} ${lastName}`;
      const guardianUserId = await createUser({
        phone,
        name,
        roles: ['parent'],
        passwordKey: 'parent',
      });
      const guardian = await tx.guardian.create({
        data: { instituteId, userId: guardianUserId, name, phone },
        select: { id: true },
      });
      guardianId = guardian.id;
      examples.parent ??= { phone, name: `${name} (1 child)` };
    }

    await tx.studentGuardian.create({
      data: {
        instituteId,
        studentId: student.id,
        guardianId,
        relation,
        isPrimary: true,
        isFeePayer: true,
      },
    });
  }

  return {
    parentPhones: `9000000101-9000000${guardianPhone - 1}`,
    studentPhones: `9000000201-9000000${studentPhone - 1}`,
    examples,
  };
}

function printCredentials({ parentPhones, studentPhones, examples }) {
  const rows = [
    ['Admin', '9000000001', PASSWORDS.admin, 'Meera Iyer'],
    ['Accountant', '9000000002', PASSWORDS.accountant, 'Rakesh Gupta'],
    ['Front office', '9000000003', PASSWORDS.front_office, 'Pooja Nair'],
    ['Teacher', '9000000012', PASSWORDS.teacher, 'Vikram Singh'],
    [
      'Teacher + parent',
      examples.teacherParent.phone,
      PASSWORDS.teacher,
      examples.teacherParent.name,
    ],
    ['Parent', examples.siblingParent.phone, PASSWORDS.parent, examples.siblingParent.name],
    ['Parent', examples.parent.phone, PASSWORDS.parent, examples.parent.name],
    ['Student', examples.student.phone, PASSWORDS.student, examples.student.name],
  ];
  const width = [18, 12, 15];
  const line = (cells) =>
    cells.map((cell, i) => (width[i] ? cell.padEnd(width[i]) : cell)).join(' ');

  console.log('\nDemo institute seeded. Institute code: %s\n', DEMO_SLUG);
  console.log(line(['Role', 'Phone', 'Password', 'Who']));
  console.log(line(['-'.repeat(17), '-'.repeat(11), '-'.repeat(14), '-'.repeat(30)]));
  rows.forEach((row) => console.log(line(row)));
  console.log('\nAll teachers (9000000011-9000000014) use %s.', PASSWORDS.teacher);
  console.log('All parents (%s) use %s.', parentPhones, PASSWORDS.parent);
  console.log('All Class 10-A students (%s) use %s.\n', studentPhones, PASSWORDS.student);
}

async function main() {
  const permissionIds = await syncPermissionCatalog();

  const institutes = await withPlatform((tx) =>
    tx.institute.findMany({ select: { id: true, slug: true } }),
  );
  for (const institute of institutes) {
    await withTenant(institute.id, (tx) => syncSystemRoles(tx, institute.id, permissionIds));
  }
  if (institutes.some((institute) => institute.slug === DEMO_SLUG)) {
    console.log(
      'Demo institute already exists; permissions and system roles synced. ' +
        'Run `npm run db:reset` for a fresh copy.',
    );
    return;
  }

  const hashes = await hashDemoPasswords();
  // The new institute's id is set as the tenant before its row exists, so RLS allows creating it.
  const instituteId = randomUUID();
  const summary = await withTenant(
    instituteId,
    (tx) => seedInstitute(tx, instituteId, permissionIds, hashes),
    { timeout: 120_000 },
  );
  printCredentials(summary);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
