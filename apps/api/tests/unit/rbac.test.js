const { requirePermission, requireModule } = require('../../src/middleware/rbac');

function run(middleware, ctx) {
  return new Promise((resolve) => {
    middleware({ ctx }, {}, (error) => resolve(error ?? null));
  });
}

const ctx = (permissions, enabledModules = { fees: true, attendance: true }) => ({
  permissions: new Set(permissions),
  enabledModules,
});

describe('requirePermission()', () => {
  test('passes when the active role has every listed permission', async () => {
    const check = requirePermission('fees.collect', 'fees.view');

    expect(await run(check, ctx(['fees.collect', 'fees.view']))).toBeNull();
  });

  test('rejects with 403 FORBIDDEN when a permission is missing', async () => {
    const error = await run(
      requirePermission('fees.collect', 'fees.reverse'),
      ctx(['fees.collect']),
    );

    expect(error).toMatchObject({ status: 403, code: 'FORBIDDEN' });
  });

  test('rejects with MODULE_DISABLED when the module is off, even for an admin', async () => {
    const error = await run(
      requirePermission('fees.collect'),
      ctx(['fees.collect'], { fees: false }),
    );

    expect(error).toMatchObject({
      status: 403,
      code: 'MODULE_DISABLED',
      details: { module: 'fees' },
    });
  });

  test('treats a module missing from enabled_modules as disabled', async () => {
    const error = await run(requirePermission('timetable.view'), ctx(['timetable.view'], {}));

    expect(error.code).toBe('MODULE_DISABLED');
  });

  test('core modules cannot be switched off', async () => {
    expect(await run(requirePermission('users.view'), ctx(['users.view'], {}))).toBeNull();
  });

  test('requires authentication first', async () => {
    expect(await run(requirePermission('users.view'), undefined)).toMatchObject({ status: 401 });
  });

  test('fails fast on a typo in a permission code', () => {
    expect(() => requirePermission('fees.colect')).toThrow(/unknown permission codes fees.colect/);
  });
});

describe('requireModule()', () => {
  test('blocks disabled modules', async () => {
    expect(await run(requireModule('attendance'), ctx([], { attendance: true }))).toBeNull();
    expect((await run(requireModule('attendance'), ctx([], {}))).code).toBe('MODULE_DISABLED');
  });
});
