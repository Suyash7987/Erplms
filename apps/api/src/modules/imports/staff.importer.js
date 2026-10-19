const { formatDateOnly } = require('../../lib/dates');
const accounts = require('../users/accounts.service');
const staffService = require('../staff/staff.service');
const { cellReader } = require('./cells');

const COLUMNS = [
  { key: 'employee_code', required: true, example: 'EMP101' },
  { key: 'name', required: true, example: 'Kavita Rao' },
  { key: 'phone', required: true, example: '9876500001' },
  { key: 'email', example: '' },
  { key: 'designation', example: 'Teacher' },
  { key: 'department', example: 'Primary' },
  { key: 'staff_type', example: 'teaching' },
  { key: 'joining_date', example: '01-06-2026' },
  { key: 'roles', example: 'teacher' },
];

const STAFF_TYPES = {
  teaching: 'teaching',
  teacher: 'teaching',
  non_teaching: 'non_teaching',
  'non-teaching': 'non_teaching',
  'non teaching': 'non_teaching',
  admin: 'non_teaching',
};

const FAMILY_ROLES = new Set(['parent', 'student']);

function parseRecord({ rowNumber, values }) {
  const errors = [];
  const cell = cellReader(values, errors);
  const roleCodes = [
    ...new Set(
      (cell.raw('roles') || 'teacher')
        .split(/[|;,]/)
        .map((code) =>
          code
            .trim()
            .toLowerCase()
            .replace(/[\s-]+/g, '_'),
        )
        .filter(Boolean),
    ),
  ];
  if (roleCodes.some((code) => FAMILY_ROLES.has(code))) {
    cell.fail('roles', 'parent and student are not staff roles');
  }
  return {
    rowNumber,
    errors,
    warnings: [],
    resolved: {
      employeeCode: cell.text('employee_code', { required: true, max: 30 }),
      name: cell.text('name', { required: true, max: 150 }),
      phone: cell.phone('phone', { required: true }),
      email: cell.email('email'),
      designation: cell.text('designation', { max: 100 }),
      department: cell.text('department', { max: 100 }),
      staffType: cell.choice('staff_type', STAFF_TYPES, 'teaching'),
      joiningDate: cell.date('joining_date'),
      roleCodes,
    },
  };
}

async function analyze(tx, ctx, records) {
  const rows = records.map(parseRecord);

  const seenCodes = new Map();
  const seenPhones = new Map();
  for (const row of rows) {
    const { employeeCode, phone } = row.resolved;
    const code = employeeCode?.toLowerCase();
    if (code && seenCodes.has(code)) {
      row.errors.push({
        column: 'employee_code',
        message: `Same employee code as row ${seenCodes.get(code)}`,
      });
    } else if (code) seenCodes.set(code, row.rowNumber);
    if (phone && seenPhones.has(phone)) {
      row.errors.push({
        column: 'phone',
        message: `Same mobile number as row ${seenPhones.get(phone)}`,
      });
    } else if (phone) seenPhones.set(phone, row.rowNumber);
  }

  const codes = rows.map((r) => r.resolved.employeeCode).filter(Boolean);
  const takenCodes = new Set(
    (
      await tx.staff.findMany({
        where: { instituteId: ctx.instituteId, employeeCode: { in: codes, mode: 'insensitive' } },
        select: { employeeCode: true },
      })
    ).map((s) => s.employeeCode.toLowerCase()),
  );
  const users = await accounts.loadUsersByPhone(
    tx,
    ctx.instituteId,
    rows.map((r) => r.resolved.phone).filter(Boolean),
  );

  const allRoleCodes = [...new Set(rows.flatMap((r) => r.resolved.roleCodes))];
  const existingRoles = await tx.role.findMany({
    where: { instituteId: ctx.instituteId, code: { in: allRoleCodes } },
    select: { code: true },
  });
  const knownCodes = new Set(existingRoles.map((r) => r.code));
  const roles = await accounts.loadRoles(tx, ctx.instituteId, [...knownCodes]);

  for (const row of rows) {
    const { employeeCode, phone, roleCodes } = row.resolved;
    if (employeeCode && takenCodes.has(employeeCode.toLowerCase())) {
      row.errors.push({
        column: 'employee_code',
        message: 'A staff member with this code already exists',
      });
    }
    const user = phone && users.get(phone);
    if (user?.staffId)
      row.errors.push({
        column: 'phone',
        message: 'This number already belongs to a staff member',
      });
    if (user?.studentId)
      row.errors.push({ column: 'phone', message: "This number is a student's own login" });
    for (const code of roleCodes) {
      const role = roles.get(code);
      if (!role) {
        row.errors.push({ column: 'roles', message: `Unknown role "${code}"` });
      } else if (role.permissions.some((permission) => !ctx.permissions.has(permission))) {
        row.errors.push({ column: 'roles', message: `You cannot give the "${code}" role` });
      }
    }
    if (user && !user.staffId && !user.studentId) {
      row.warnings.push({
        column: 'phone',
        message: 'This number already has a login; the staff roles will be added to it',
      });
    }
  }

  return { rows, users, roles };
}

function summarize(analysis, validRows) {
  const newLogins = validRows.filter((row) => !analysis.users.has(row.resolved.phone)).length;
  return {
    newStaff: validRows.length,
    newLogins,
    linkedToExistingLogins: validRows.length - newLogins,
  };
}

function preview(row) {
  const { employeeCode, name, phone, designation, staffType, joiningDate, roleCodes } =
    row.resolved;
  return {
    row: row.rowNumber,
    employeeCode,
    name,
    phone,
    designation,
    staffType,
    joiningDate: formatDateOnly(joiningDate),
    roles: roleCodes,
  };
}

function plan(batch, analysis, validRows, takeCredential) {
  const stats = { staffCreated: 0, usersCreated: 0 };
  for (const row of validRows) {
    staffService.planStaff(batch, {
      users: analysis.users,
      roles: analysis.roles,
      row: row.resolved,
      takeCredential,
      stats,
    });
  }
  return stats;
}

module.exports = {
  type: 'staff',
  permission: 'staff.import',
  COLUMNS,
  analyze,
  summarize,
  preview,
  plan,
  newLoginCount: (analysis, validRows) => summarize(analysis, validRows).newLogins,
};
