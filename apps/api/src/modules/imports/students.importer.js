const { AppError } = require('../../lib/errors');
const { formatDateOnly } = require('../../lib/dates');
const { requireCurrentYear } = require('../academic-years/academic-years.service');
const students = require('../students/students.service');
const { cellReader, GENDERS, RELATIONS } = require('./cells');

const COLUMNS = [
  { key: 'admission_no', required: true, example: 'ADM2026101' },
  { key: 'first_name', required: true, example: 'Aarav' },
  { key: 'last_name', example: 'Sharma' },
  { key: 'gender', example: 'male' },
  { key: 'date_of_birth', example: '15-06-2019' },
  { key: 'class', required: true, example: 'Class 1' },
  { key: 'section', required: true, example: 'A' },
  { key: 'roll_no', example: '1' },
  { key: 'admission_date', example: '01-04-2026' },
  { key: 'blood_group', example: 'B+' },
  { key: 'address', example: '12 MG Road, Pune' },
  { key: 'student_phone', example: '' },
  { key: 'guardian_name', required: true, example: 'Ramesh Sharma' },
  { key: 'guardian_phone', required: true, example: '9876543210' },
  { key: 'guardian_relation', example: 'father' },
  { key: 'guardian_email', example: '' },
  { key: 'guardian2_name', example: 'Sunita Sharma' },
  { key: 'guardian2_phone', example: '9876543211' },
  { key: 'guardian2_relation', example: 'mother' },
];

const lower = (value) =>
  String(value ?? '')
    .trim()
    .toLowerCase();

/** "Class 5", "5", "V"-style codes: a class can be referred to by name, code or trailing number. */
function buildLevelIndex(levels) {
  const index = new Map();
  for (const level of levels) {
    for (const key of [lower(level.name), lower(level.code), level.name.match(/(\d+)\s*$/)?.[1]]) {
      if (key && !index.has(key)) index.set(key, level);
    }
  }
  return index;
}

function parseRecord({ rowNumber, values }, { levelIndex, sectionIndex }) {
  const errors = [];
  const cell = cellReader(values, errors);

  const student = {
    admissionNo: cell.text('admission_no', { required: true, max: 30 }),
    firstName: cell.text('first_name', { required: true, max: 100 }),
    lastName: cell.text('last_name', { max: 100 }),
    gender: cell.choice('gender', GENDERS),
    dateOfBirth: cell.date('date_of_birth'),
    admissionDate: cell.date('admission_date'),
    bloodGroup: (() => {
      const value = cell.raw('blood_group').toUpperCase();
      if (!value) return null;
      return /^(A|B|AB|O)[+-]$/.test(value) ? value : cell.fail('blood_group', 'e.g. B+ or O-');
    })(),
    address: cell.text('address', { max: 300 }),
  };

  const className = cell.text('class', { required: true, max: 60 });
  const sectionName = cell.text('section', { required: true, max: 30 });
  let section = null;
  if (className && sectionName) {
    const level = levelIndex.get(lower(className));
    if (!level) cell.fail('class', `No class called "${className}"`);
    else {
      section = sectionIndex.get(`${level.id}|${lower(sectionName)}`) ?? null;
      if (!section) cell.fail('section', `${level.name} has no section "${sectionName}" this year`);
    }
  }

  const guardians = [];
  for (const [prefix, required] of [
    ['guardian', true],
    ['guardian2', false],
  ]) {
    const name = cell.text(`${prefix}_name`, { required, max: 150 });
    const phone = cell.phone(`${prefix}_phone`, { required });
    if (
      !required &&
      Boolean(name) !== Boolean(phone) &&
      !errors.some((e) => e.column.startsWith(prefix))
    ) {
      cell.fail(`${prefix}_${name ? 'phone' : 'name'}`, 'Give both the name and mobile number');
    }
    if (name && phone) {
      guardians.push({
        column: `${prefix}_phone`,
        name,
        phone,
        email: prefix === 'guardian' ? cell.email('guardian_email') : null,
        relation: cell.choice(`${prefix}_relation`, RELATIONS, 'guardian'),
        isPrimary: prefix === 'guardian',
        isFeePayer: prefix === 'guardian',
      });
    }
  }
  if (guardians.length === 2 && guardians[0].phone === guardians[1].phone) {
    cell.fail('guardian2_phone', 'Must differ from the first guardian');
  }

  const studentPhone = cell.phone('student_phone');
  if (studentPhone && guardians.some((g) => g.phone === studentPhone)) {
    cell.fail('student_phone', "Must differ from the guardians' numbers");
  }

  return {
    rowNumber,
    errors,
    warnings: [],
    resolved: {
      student,
      sectionId: section?.id ?? null,
      sectionLabel: section ? `${section.levelName} - ${section.name}` : null,
      rollNo: cell.integer('roll_no', { min: 1, max: 999 }),
      studentPhone,
      guardians,
    },
  };
}

async function analyze(tx, ctx, records, { academicYearId }) {
  const year = academicYearId
    ? await tx.academicYear.findFirst({
        where: { id: academicYearId, instituteId: ctx.instituteId },
        select: { id: true, name: true },
      })
    : await requireCurrentYear(tx, ctx.instituteId);
  if (!year) throw AppError.notFound('Academic year not found');

  const levels = await tx.level.findMany({
    where: { instituteId: ctx.instituteId, isActive: true },
    select: { id: true, name: true, code: true },
  });
  const sections = await tx.section.findMany({
    where: { instituteId: ctx.instituteId, academicYearId: year.id, isActive: true },
    select: { id: true, name: true, levelId: true, level: { select: { name: true } } },
  });
  const levelIndex = buildLevelIndex(levels);
  const sectionIndex = new Map(
    sections.map((s) => [`${s.levelId}|${lower(s.name)}`, { ...s, levelName: s.level.name }]),
  );

  const rows = records.map((record) => parseRecord(record, { levelIndex, sectionIndex }));

  // Duplicates inside the file
  const seen = { admission: new Map(), roll: new Map(), studentPhone: new Map() };
  for (const row of rows) {
    const { student, sectionId, rollNo, studentPhone } = row.resolved;
    const checks = [
      [
        seen.admission,
        student.admissionNo && lower(student.admissionNo),
        'admission_no',
        'admission number',
      ],
      [
        seen.roll,
        sectionId && rollNo && `${sectionId}|${rollNo}`,
        'roll_no',
        'roll number in this section',
      ],
      [seen.studentPhone, studentPhone, 'student_phone', 'student mobile number'],
    ];
    for (const [map, key, column, what] of checks) {
      if (!key) continue;
      if (map.has(key)) row.errors.push({ column, message: `Same ${what} as row ${map.get(key)}` });
      else map.set(key, row.rowNumber);
    }
  }

  // Clashes with existing records
  const admissionNos = rows.map((r) => r.resolved.student.admissionNo).filter(Boolean);
  const takenAdmissions = new Set(
    (
      await tx.student.findMany({
        where: {
          instituteId: ctx.instituteId,
          academicYearId: year.id,
          admissionNo: { in: admissionNos },
        },
        select: { admissionNo: true },
      })
    ).map((s) => lower(s.admissionNo)),
  );
  const sectionIds = [...new Set(rows.map((r) => r.resolved.sectionId).filter(Boolean))];
  const takenRolls = new Set(
    (
      await tx.studentEnrollment.findMany({
        where: {
          instituteId: ctx.instituteId,
          academicYearId: year.id,
          sectionId: { in: sectionIds },
          rollNo: { not: null },
        },
        select: { sectionId: true, rollNo: true },
      })
    ).map((e) => `${e.sectionId}|${e.rollNo}`),
  );

  const family = await students.prepareFamilyContext(tx, ctx, {
    guardianPhones: rows.flatMap((r) => r.resolved.guardians.map((g) => g.phone)),
    studentPhones: rows.map((r) => r.resolved.studentPhone).filter(Boolean),
  });

  const guardianNames = new Map();
  for (const row of rows) {
    const { student, sectionId, rollNo } = row.resolved;
    if (student.admissionNo && takenAdmissions.has(lower(student.admissionNo))) {
      row.errors.push({
        column: 'admission_no',
        message: 'A student with this admission number already exists',
      });
    }
    if (sectionId && rollNo && takenRolls.has(`${sectionId}|${rollNo}`)) {
      row.errors.push({
        column: 'roll_no',
        message: 'This roll number is already taken in the section',
      });
    }
    row.errors.push(...students.familyConflicts(row.resolved, family));

    for (const guardian of row.resolved.guardians) {
      const known = family.guardians.get(guardian.phone)?.name ?? guardianNames.get(guardian.phone);
      if (known && lower(known) !== lower(guardian.name)) {
        row.warnings.push({
          column: guardian.column,
          message: `This number is already saved for "${known}"; that guardian will be linked`,
        });
      }
      if (!guardianNames.has(guardian.phone)) guardianNames.set(guardian.phone, guardian.name);
    }
  }

  return { year, rows, family };
}

/** Counts what an import would create, from the valid rows only. */
function summarize(analysis, validRows) {
  const knownGuardians = new Set(analysis.family.guardians.keys());
  const knownUsers = new Set(analysis.family.users.keys());
  const newGuardians = new Set();
  const newLogins = new Set();
  let siblingLinks = 0;
  for (const row of validRows) {
    for (const guardian of row.resolved.guardians) {
      if (knownGuardians.has(guardian.phone) || newGuardians.has(guardian.phone)) siblingLinks += 1;
      else newGuardians.add(guardian.phone);
      if (!knownUsers.has(guardian.phone)) newLogins.add(guardian.phone);
    }
    if (row.resolved.studentPhone) newLogins.add(row.resolved.studentPhone);
  }
  return {
    newStudents: validRows.length,
    newGuardians: newGuardians.size,
    siblingLinks,
    newLogins: newLogins.size,
  };
}

function preview(row) {
  const { student, sectionLabel, rollNo, guardians, studentPhone } = row.resolved;
  return {
    row: row.rowNumber,
    admissionNo: student.admissionNo,
    name: [student.firstName, student.lastName].filter(Boolean).join(' '),
    dateOfBirth: formatDateOnly(student.dateOfBirth),
    section: sectionLabel,
    rollNo,
    studentLogin: Boolean(studentPhone),
    guardians: guardians.map((g) => `${g.name} (${g.phone})`),
  };
}

function plan(batch, analysis, validRows, takeCredential) {
  const stats = students.newStats();
  for (const row of validRows) {
    students.planStudent(batch, {
      family: analysis.family,
      academicYearId: analysis.year.id,
      row: row.resolved,
      takeCredential,
      stats,
    });
  }
  return stats;
}

module.exports = {
  type: 'students',
  permission: 'students.import',
  COLUMNS,
  analyze,
  summarize,
  preview,
  plan,
  newLoginCount: (analysis, validRows) => summarize(analysis, validRows).newLogins,
};
