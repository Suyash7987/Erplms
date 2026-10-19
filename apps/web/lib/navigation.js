/**
 * Navigation per role area. An item is shown only when the active role has its permission and,
 * for module features, the institute has the module switched on.
 */
const NAV_ITEMS = {
  '/admin': [
    { href: '/admin', labelKey: 'nav.home', exact: true },
    { href: '/admin/students', labelKey: 'nav.students', permission: 'students.view' },
    { href: '/admin/staff', labelKey: 'nav.staff', permission: 'staff.view' },
    {
      href: '/admin/attendance',
      labelKey: 'nav.attendance',
      permission: 'attendance.mark',
      module: 'attendance',
      exact: true,
    },
    {
      href: '/admin/attendance/reports',
      labelKey: 'nav.attendanceReports',
      permission: 'attendance.report',
      module: 'attendance',
    },
    { href: '/admin/import', labelKey: 'nav.import', permission: 'students.import' },
    { href: '/admin/setup', labelKey: 'nav.setup', permission: 'institute.manage' },
    { href: '/admin/classes', labelKey: 'nav.classes', permission: 'academics.view' },
    { href: '/admin/subjects', labelKey: 'nav.subjects', permission: 'academics.view' },
    { href: '/admin/academic-years', labelKey: 'nav.academicYears', permission: 'academics.view' },
    { href: '/admin/settings', labelKey: 'nav.settings', permission: 'institute.view' },
  ],
  '/teacher': [
    { href: '/teacher', labelKey: 'nav.home', exact: true },
    {
      href: '/teacher/attendance',
      labelKey: 'nav.attendance',
      permission: 'attendance.mark',
      module: 'attendance',
      exact: true,
    },
    {
      href: '/teacher/attendance/reports',
      labelKey: 'nav.attendanceReports',
      permission: 'attendance.report',
      module: 'attendance',
    },
  ],
  '/parent': [
    { href: '/parent', labelKey: 'nav.home', exact: true },
    {
      href: '/parent/attendance',
      labelKey: 'nav.attendance',
      permission: 'attendance.view_own',
      module: 'attendance',
    },
  ],
  '/student': [
    { href: '/student', labelKey: 'nav.home', exact: true },
    {
      href: '/student/attendance',
      labelKey: 'nav.attendance',
      permission: 'attendance.view_own',
      module: 'attendance',
    },
  ],
};

export function navItemsFor(area, session) {
  const permissions = new Set(session.permissions);
  const modules = session.institute.enabledModules ?? {};
  return (NAV_ITEMS[area] ?? []).filter(
    (item) =>
      (!item.permission || permissions.has(item.permission)) &&
      (!item.module || modules[item.module] === true),
  );
}

export function isActivePath(item, pathname) {
  return item.exact ? pathname === item.href : pathname.startsWith(item.href);
}
