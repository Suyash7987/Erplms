/**
 * Permission catalog and default permissions for the system roles.
 * Seeded into `permissions`; each institute gets its own copy of the system roles in `roles`,
 * which admins can extend with custom roles.
 *
 * `module` matches a key in institutes.enabled_modules. Modules listed in CORE_MODULES are always on.
 * Codes ending in `_own` are limited to the caller's own records (a parent's children, a student's self).
 */

const CORE_MODULES = Object.freeze(['institute', 'academics', 'users', 'roles', 'people', 'audit']);

/** Modules that institutes can switch on/off via enabled_modules. */
const TOGGLEABLE_MODULES = Object.freeze(['attendance', 'leaves', 'timetable', 'notices', 'fees']);

const PERMISSIONS = Object.freeze([
  {
    code: 'institute.view',
    module: 'institute',
    description: 'View institute profile and settings',
  },
  {
    code: 'institute.manage',
    module: 'institute',
    description: 'Edit institute profile, settings and modules',
  },

  {
    code: 'academics.view',
    module: 'academics',
    description: 'View academic years, classes, sections and subjects',
  },
  {
    code: 'academics.manage',
    module: 'academics',
    description: 'Manage academic years, classes, sections and subjects',
  },

  { code: 'users.view', module: 'users', description: 'View user accounts' },
  { code: 'users.create', module: 'users', description: 'Create user accounts' },
  { code: 'users.update', module: 'users', description: 'Enable, disable and edit user accounts' },
  { code: 'users.reset_password', module: 'users', description: 'Reset a user password' },

  { code: 'roles.view', module: 'roles', description: 'View roles and permissions' },
  {
    code: 'roles.manage',
    module: 'roles',
    description: 'Create custom roles and assign roles to users',
  },

  { code: 'students.view', module: 'people', description: 'View student records' },
  {
    code: 'students.view_own',
    module: 'people',
    description: "View own or own children's student records",
  },
  { code: 'students.create', module: 'people', description: 'Add students and enrollments' },
  { code: 'students.update', module: 'people', description: 'Edit students and enrollments' },
  {
    code: 'students.archive',
    module: 'people',
    description: 'Change student status (soft delete)',
  },
  {
    code: 'students.import',
    module: 'people',
    description: 'Bulk import students and guardians from CSV',
  },
  { code: 'guardians.view', module: 'people', description: 'View guardians' },
  {
    code: 'guardians.manage',
    module: 'people',
    description: 'Add and edit guardians and sibling links',
  },
  { code: 'staff.view', module: 'people', description: 'View staff' },
  { code: 'staff.create', module: 'people', description: 'Add staff' },
  { code: 'staff.update', module: 'people', description: 'Edit staff' },
  { code: 'staff.import', module: 'people', description: 'Bulk import staff from CSV' },

  { code: 'attendance.view', module: 'attendance', description: 'View attendance of any section' },
  {
    code: 'attendance.view_own',
    module: 'attendance',
    description: "View own or own children's attendance",
  },
  { code: 'attendance.mark', module: 'attendance', description: 'Mark attendance' },
  {
    code: 'attendance.edit',
    module: 'attendance',
    description: 'Edit attendance within the edit window',
  },
  {
    code: 'attendance.edit_any',
    module: 'attendance',
    description: 'Edit attendance outside the edit window',
  },
  { code: 'attendance.report', module: 'attendance', description: 'View attendance reports' },

  { code: 'leaves.view', module: 'leaves', description: 'View leave requests' },
  { code: 'leaves.apply', module: 'leaves', description: 'Apply for leave (self or own child)' },
  { code: 'leaves.approve', module: 'leaves', description: 'Approve or reject leave requests' },

  { code: 'timetable.view', module: 'timetable', description: 'View timetables' },
  {
    code: 'timetable.manage',
    module: 'timetable',
    description: 'Manage periods and timetable slots',
  },

  { code: 'notices.view', module: 'notices', description: 'View notices addressed to the user' },
  { code: 'notices.create', module: 'notices', description: 'Create and publish notices' },
  {
    code: 'notices.manage',
    module: 'notices',
    description: 'Edit or archive any notice and see read receipts',
  },

  { code: 'fees.view', module: 'fees', description: 'View fee setup, invoices and payments' },
  { code: 'fees.view_own', module: 'fees', description: "View own children's dues and receipts" },
  { code: 'fees.manage', module: 'fees', description: 'Manage fee heads and fee structures' },
  {
    code: 'fees.invoice',
    module: 'fees',
    description: 'Generate student invoices and apply late fines',
  },
  { code: 'fees.concession', module: 'fees', description: 'Grant concessions' },
  { code: 'fees.collect', module: 'fees', description: 'Collect payments and issue receipts' },
  { code: 'fees.reverse', module: 'fees', description: 'Reverse a payment' },
  { code: 'fees.report', module: 'fees', description: 'View collection and defaulter reports' },

  { code: 'audit.view', module: 'audit', description: 'View audit logs' },
]);

const ALL_CODES = PERMISSIONS.map((permission) => permission.code);

const SYSTEM_ROLES = Object.freeze([
  {
    code: 'admin',
    name: 'Administrator',
    description: 'Full access to the institute',
    permissions: ALL_CODES,
  },
  {
    code: 'teacher',
    name: 'Teacher',
    description: 'Marks attendance and views assigned classes',
    permissions: [
      'academics.view',
      'students.view',
      'guardians.view',
      'staff.view',
      'attendance.view',
      'attendance.mark',
      'attendance.edit',
      'attendance.report',
      'leaves.view',
      'leaves.apply',
      'leaves.approve',
      'timetable.view',
      'notices.view',
      'notices.create',
    ],
  },
  {
    code: 'accountant',
    name: 'Accountant',
    description: 'Fee setup, collection and reports',
    permissions: [
      'academics.view',
      'students.view',
      'guardians.view',
      'notices.view',
      'fees.view',
      'fees.manage',
      'fees.invoice',
      'fees.concession',
      'fees.collect',
      'fees.reverse',
      'fees.report',
    ],
  },
  {
    code: 'front_office',
    name: 'Front office',
    description: 'Admissions, records and user accounts',
    permissions: [
      'academics.view',
      'users.view',
      'users.create',
      'users.reset_password',
      'students.view',
      'students.create',
      'students.update',
      'students.import',
      'guardians.view',
      'guardians.manage',
      'staff.view',
      'attendance.view',
      'leaves.view',
      'timetable.view',
      'notices.view',
      'notices.create',
      'fees.view',
    ],
  },
  {
    code: 'student',
    name: 'Student',
    description: 'Own attendance, timetable and notices',
    permissions: ['students.view_own', 'attendance.view_own', 'timetable.view', 'notices.view'],
  },
  {
    code: 'parent',
    name: 'Parent',
    description: "Children's attendance, fees, timetable and notices",
    permissions: [
      'students.view_own',
      'attendance.view_own',
      'leaves.apply',
      'timetable.view',
      'notices.view',
      'fees.view_own',
    ],
  },
]);

function assertCatalogIsConsistent() {
  const known = new Set(ALL_CODES);
  if (known.size !== ALL_CODES.length) {
    throw new Error('Duplicate permission code in catalog');
  }
  for (const role of SYSTEM_ROLES) {
    const unknown = role.permissions.filter((code) => !known.has(code));
    if (unknown.length) {
      throw new Error(`Role ${role.code} references unknown permissions: ${unknown.join(', ')}`);
    }
  }
}

assertCatalogIsConsistent();

module.exports = { PERMISSIONS, SYSTEM_ROLES, CORE_MODULES, TOGGLEABLE_MODULES };
