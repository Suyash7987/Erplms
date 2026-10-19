const {
  PERMISSIONS,
  SYSTEM_ROLES,
  CORE_MODULES,
  TOGGLEABLE_MODULES,
} = require('../../src/config/permissions');

describe('permission catalog', () => {
  test('codes are unique and look like module.action', () => {
    const codes = PERMISSIONS.map((permission) => permission.code);

    expect(new Set(codes).size).toBe(codes.length);
    for (const code of codes) {
      expect(code).toMatch(/^[a-z]+\.[a-z_]+$/);
    }
  });

  test('every permission belongs to a known module', () => {
    const modules = new Set([...CORE_MODULES, ...TOGGLEABLE_MODULES]);

    for (const permission of PERMISSIONS) {
      expect(modules.has(permission.module)).toBe(true);
    }
  });

  test('seeds the six system roles; admin has every permission', () => {
    const byCode = Object.fromEntries(SYSTEM_ROLES.map((role) => [role.code, role]));

    expect(Object.keys(byCode).sort()).toEqual(
      ['accountant', 'admin', 'front_office', 'parent', 'student', 'teacher'].sort(),
    );
    expect(byCode.admin.permissions).toHaveLength(PERMISSIONS.length);
  });

  test('parents and students only get their own records', () => {
    const byCode = Object.fromEntries(SYSTEM_ROLES.map((role) => [role.code, role]));

    for (const code of ['parent', 'student']) {
      expect(byCode[code].permissions).not.toContain('students.view');
      expect(byCode[code].permissions).not.toContain('fees.collect');
      expect(byCode[code].permissions).toContain('students.view_own');
    }
  });

  test('only accountants and admins can collect or reverse fees', () => {
    const holders = (code) =>
      SYSTEM_ROLES.filter((role) => role.permissions.includes(code)).map((role) => role.code);

    expect(holders('fees.collect').sort()).toEqual(['accountant', 'admin']);
    expect(holders('fees.reverse').sort()).toEqual(['accountant', 'admin']);
  });
});
