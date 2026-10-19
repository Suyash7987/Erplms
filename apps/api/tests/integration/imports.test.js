const request = require('supertest');
const { createApp } = require('../../src/app');
const { prisma, withTenant } = require('../../src/lib/prisma');
const { toCsv } = require('../../src/lib/csv');
const { createAuthTenant, signIn } = require('../helpers/auth-fixtures');

const app = createApp();
let t;
let admin;
let frontOffice;

const HEADER = [
  'admission_no',
  'first_name',
  'last_name',
  'gender',
  'date_of_birth',
  'class',
  'section',
  'roll_no',
  'student_phone',
  'guardian_name',
  'guardian_phone',
  'guardian_relation',
  'guardian2_name',
  'guardian2_phone',
  'guardian2_relation',
];

const csvOf = (rows) => toCsv([HEADER, ...rows]);

beforeAll(async () => {
  t = await createAuthTenant('Import');
  admin = (await signIn(app, t, 'admin')).agent;
  frontOffice = (await signIn(app, t, 'frontOffice')).agent;
});

afterAll(() => prisma.$disconnect());

const inTenant = (work) => withTenant(t.instituteId, work);

describe('student CSV import', () => {
  const goodRows = [
    [
      'I001',
      'Asha',
      'Kale',
      'F',
      '15-06-2018',
      'Class 3',
      'a',
      '11',
      '',
      'Vijay Kale',
      '9234500001',
      'Father',
      'Rekha Kale',
      '9234500002',
      'mother',
    ],
    [
      'I002',
      'Bhavesh',
      'Kale',
      'boy',
      '2016-01-20',
      '3',
      'A',
      '12',
      '',
      'Vijay Kale',
      '9234500001',
      'father',
      '',
      '',
      '',
    ],
    [
      'I003',
      'Chitra',
      'Iyer',
      '',
      '',
      'class 3',
      'A',
      '',
      '9234500010',
      'Lakshmi Iyer',
      '9234500003',
      '',
      '',
      '',
      '',
    ],
  ];

  test('the template lists the columns', async () => {
    const res = await frontOffice.get('/api/v1/imports/students/template');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.text.replace(/^\uFEFF/, '').split('\r\n')[0]).toMatch(/^admission_no,first_name,/);
  });

  test('a dry run validates every row and saves nothing', async () => {
    const res = await frontOffice
      .post('/api/v1/imports/students')
      .send({ csv: csvOf(goodRows), dryRun: true });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      dryRun: true,
      totalRows: 3,
      validRows: 3,
      invalidRows: 0,
      errors: [],
      summary: { newStudents: 3, newGuardians: 3, siblingLinks: 1, newLogins: 4 },
      academicYear: { name: t.year.name },
    });
    expect(res.body.preview[0]).toMatchObject({
      row: 2,
      name: 'Asha Kale',
      dateOfBirth: '2018-06-15',
      section: 'Class 3 - A',
      guardians: ['Vijay Kale (9234500001)', 'Rekha Kale (9234500002)'],
    });
    const saved = await inTenant((tx) =>
      tx.student.count({ where: { admissionNo: { startsWith: 'I0' } } }),
    );
    expect(saved).toBe(0);
  });

  test('reports row-level errors with the column and spreadsheet row number', async () => {
    const bad = [
      [
        'I010',
        '',
        'X',
        'maybe',
        '31-02-2018',
        'Class 9',
        'A',
        '0',
        '12345',
        'Parent',
        '9234500020',
        'uncle',
        'Half',
        '',
        '',
      ],
      [
        'I011',
        'Dev',
        '',
        '',
        '',
        'Class 3',
        'Z',
        '',
        '',
        'Parent Two',
        '9234500021',
        '',
        '',
        '',
        '',
      ],
      [
        'I011',
        'Dup',
        '',
        '',
        '',
        'Class 3',
        'A',
        '',
        '',
        'Parent Three',
        '9234500022',
        '',
        '',
        '',
        '',
      ],
      [
        'A1',
        'Clash',
        '',
        '',
        '',
        'Class 3',
        'A',
        '1',
        '',
        'Clash Parent',
        t.users.student.phone,
        '',
        '',
        '',
        '',
      ],
    ];
    const res = await frontOffice
      .post('/api/v1/imports/students')
      .send({ csv: csvOf(bad), dryRun: true });
    const errorsFor = (row) =>
      res.body.errors
        .filter((e) => e.row === row)
        .map((e) => e.column)
        .sort();

    expect(res.body).toMatchObject({ totalRows: 4, validRows: 0, invalidRows: 4 });
    expect(errorsFor(2)).toEqual(
      [
        'class',
        'date_of_birth',
        'first_name',
        'gender',
        'guardian2_phone',
        'guardian_relation',
        'roll_no',
        'student_phone',
      ].sort(),
    );
    expect(errorsFor(3)).toEqual(['section']);
    expect(res.body.errors.find((e) => e.row === 4)).toMatchObject({
      column: 'admission_no',
      message: 'Same admission number as row 3',
    });
    // Row 5 clashes with existing data: admission number A1, roll 1 and a student's own login.
    expect(errorsFor(5)).toEqual(['admission_no', 'guardian_phone', 'roll_no']);
  });

  test('refuses to import a file with errors unless asked to skip them', async () => {
    const mixed = [
      ...goodRows,
      ['I099', '', '', '', '', 'Class 3', 'A', '', '', 'P', '9234500030', '', '', '', ''],
    ];

    const refused = await frontOffice
      .post('/api/v1/imports/students')
      .send({ csv: csvOf(mixed), dryRun: false });
    expect(refused.status).toBe(422);
    expect(refused.body.error.code).toBe('IMPORT_INVALID');
    expect(refused.body.error.details.invalidRows).toBe(1);

    const imported = await frontOffice
      .post('/api/v1/imports/students')
      .send({ csv: csvOf(mixed), dryRun: false, skipInvalidRows: true });
    expect(imported.status).toBe(200);
    expect(imported.headers['cache-control']).toBe('no-store');
    expect(imported.body).toMatchObject({
      imported: 3,
      skipped: 1,
      stats: { studentsCreated: 3, guardiansCreated: 3, siblingLinks: 1 },
    });
    expect(imported.body.credentials.map((c) => [c.phone, c.role]).sort()).toEqual(
      [
        ['9234500001', 'parent'],
        ['9234500002', 'parent'],
        ['9234500003', 'parent'],
        ['9234500010', 'student'],
      ].sort(),
    );
  });

  test('imported families are linked: siblings share one guardian and logins work', async () => {
    const students = await admin.get('/api/v1/students?q=kale');
    const asha = (
      await admin.get(
        `/api/v1/students/${students.body.data.find((s) => s.firstName === 'Asha').id}`,
      )
    ).body;

    expect(asha.siblings.map((s) => s.name)).toEqual(['Bhavesh Kale']);
    expect(asha.guardians.map((g) => [g.name, g.relation, g.isPrimary])).toEqual([
      ['Vijay Kale', 'father', true],
      ['Rekha Kale', 'mother', false],
    ]);
    expect(asha.enrollments[0]).toMatchObject({ rollNo: 11, section: { name: 'A' } });

    const audit = await inTenant((tx) =>
      tx.auditLog.findFirst({ where: { action: 'import.students' } }),
    );
    expect(audit.after).toMatchObject({ imported: 3, skipped: 1 });
    expect(JSON.stringify(audit)).not.toMatch(/temporaryPassword/);
  });

  test('importing the same file again finds every row already present', async () => {
    const res = await frontOffice
      .post('/api/v1/imports/students')
      .send({ csv: csvOf(goodRows), dryRun: true });

    expect(res.body.validRows).toBe(0);
    expect(res.body.errors.filter((e) => e.column === 'admission_no')).toHaveLength(3);
  });

  test('rejects files with a wrong header or too many rows', async () => {
    const wrongHeader = await frontOffice
      .post('/api/v1/imports/students')
      .send({ csv: 'name,class\nA,1', dryRun: true });
    const tooMany = await frontOffice.post('/api/v1/imports/students').send({
      csv: csvOf(
        Array.from({ length: 2001 }, (_, i) => [
          `B${i}`,
          'X',
          '',
          '',
          '',
          'Class 3',
          'A',
          '',
          '',
          'P',
          '9234500040',
          '',
          '',
          '',
          '',
        ]),
      ),
      dryRun: true,
    });

    expect(wrongHeader.status).toBe(400);
    expect(wrongHeader.body.error.details.missingColumns).toEqual(
      expect.arrayContaining(['admission_no', 'first_name', 'guardian_phone']),
    );
    expect(tooMany.status).toBe(400);
  });

  test('teachers cannot import', async () => {
    const teacher = (await signIn(app, t, 'teacher')).agent;
    const res = await teacher.post('/api/v1/imports/students').send({ csv: csvOf(goodRows) });

    expect(res.status).toBe(403);
  });
});

describe('staff CSV import', () => {
  const header = [
    'employee_code',
    'name',
    'phone',
    'designation',
    'staff_type',
    'joining_date',
    'roles',
  ];

  test('imports staff with logins; an existing parent number gains the staff role', async () => {
    const csv = toCsv([
      header,
      ['S-100', 'Neha Gupta', '9234500100', 'Teacher', 'teaching', '01-06-2026', 'teacher'],
      ['S-101', 'Vijay Kale', '9234500001', 'Accountant', 'non teaching', '', 'accountant'],
      ['S-102', 'Bad Role', '9234500102', '', '', '', 'principal'],
    ]);

    const dry = await admin.post('/api/v1/imports/staff').send({ csv, dryRun: true });
    expect(dry.body).toMatchObject({
      validRows: 2,
      invalidRows: 1,
      summary: { newStaff: 2, newLogins: 1 },
    });
    expect(dry.body.errors).toEqual([
      { row: 4, column: 'roles', message: 'Unknown role "principal"' },
    ]);
    expect(dry.body.warnings).toEqual([expect.objectContaining({ row: 3, column: 'phone' })]);

    const done = await admin
      .post('/api/v1/imports/staff')
      .send({ csv, dryRun: false, skipInvalidRows: true });
    expect(done.body).toMatchObject({ imported: 2, stats: { staffCreated: 2, usersCreated: 1 } });
    expect(done.body.credentials.map((c) => c.phone)).toEqual(['9234500100']);

    const vijay = await request(app)
      .post('/api/v1/auth/login')
      .send({ instituteCode: t.slug, phone: '9234500001', password: 'wrong' });
    expect(vijay.status).toBe(401); // still has his own temporary parent password, not a new one
  });

  test('front office has no staff import permission', async () => {
    const res = await frontOffice
      .post('/api/v1/imports/staff')
      .send({ csv: toCsv([header, ['S-200', 'X', '9234500200', '', '', '', '']]) });

    expect(res.status).toBe(403);
  });
});
