const { prisma, withTenant, withPlatform } = require('../../src/lib/prisma');
const { createTenant } = require('../helpers/fixtures');

let a;
let b;

beforeAll(async () => {
  a = await createTenant('Alpha');
  b = await createTenant('Beta');
});

afterAll(() => prisma.$disconnect());

describe('database role', () => {
  test('the app connects as a role that cannot bypass Row Level Security', async () => {
    const [role] = await prisma.$queryRaw`
      SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`;

    expect(role).toEqual({ rolsuper: false, rolbypassrls: false });
  });
});

describe('tenant isolation: reads', () => {
  test('tenant A only sees its own rows', async () => {
    const seen = await withTenant(a.instituteId, async (tx) => ({
      institutes: await tx.institute.findMany({ select: { id: true } }),
      users: await tx.user.findMany({ select: { instituteId: true } }),
      students: await tx.student.findMany({ select: { id: true } }),
      sections: await tx.section.count(),
    }));

    expect(seen.institutes).toEqual([{ id: a.instituteId }]);
    expect(seen.users).toEqual([{ instituteId: a.instituteId }]);
    expect(seen.students).toEqual([{ id: a.studentId }]);
    expect(seen.sections).toBe(2);
  });

  test("tenant A cannot read tenant B's rows by id, by filter or with raw SQL", async () => {
    const seen = await withTenant(a.instituteId, async (tx) => ({
      byId: await tx.student.findUnique({ where: { id: b.studentId } }),
      byFilter: await tx.user.count({ where: { instituteId: b.instituteId } }),
      raw: await tx.$queryRaw`
        SELECT count(*)::int AS n FROM students WHERE institute_id = ${b.instituteId}::uuid`,
    }));

    expect(seen.byId).toBeNull();
    expect(seen.byFilter).toBe(0);
    expect(seen.raw).toEqual([{ n: 0 }]);
  });

  test('without a tenant context, tenant tables return nothing', async () => {
    expect(await prisma.institute.count()).toBe(0);
    expect(await prisma.user.count()).toBe(0);
    expect(await prisma.student.count()).toBe(0);
  });

  test('phone numbers are unique per institute, not globally', async () => {
    const count = (tenant) =>
      withTenant(tenant.instituteId, (tx) => tx.user.count({ where: { phone: '9876543210' } }));

    expect(await count(a)).toBe(1);
    expect(await count(b)).toBe(1);
  });
});

describe('tenant isolation: writes', () => {
  test('tenant A cannot insert a row that belongs to tenant B', async () => {
    const attempt = withTenant(a.instituteId, (tx) =>
      tx.student.create({
        data: {
          instituteId: b.instituteId,
          academicYearId: b.academicYearId,
          admissionNo: 'X001',
          firstName: 'Intruder',
        },
      }),
    );

    await expect(attempt).rejects.toThrow(/row-level security/);
  });

  test("tenant A cannot update or delete tenant B's rows", async () => {
    const result = await withTenant(a.instituteId, async (tx) => ({
      updated: await tx.student.updateMany({
        where: { id: b.studentId },
        data: { firstName: 'Hacked' },
      }),
      deleted: await tx.user.deleteMany({ where: { instituteId: b.instituteId } }),
    }));
    const untouched = await withTenant(b.instituteId, (tx) =>
      tx.student.findUnique({ where: { id: b.studentId } }),
    );

    expect(result.updated.count).toBe(0);
    expect(result.deleted.count).toBe(0);
    expect(untouched.firstName).toBe('BetaStudent');
  });

  test("updating tenant B's row by id fails as not found", async () => {
    const attempt = withTenant(a.instituteId, (tx) =>
      tx.student.update({ where: { id: b.studentId }, data: { firstName: 'Hacked' } }),
    );

    await expect(attempt).rejects.toMatchObject({ code: 'P2025' });
  });

  test('tenant A cannot move its own row into tenant B', async () => {
    const attempt = withTenant(a.instituteId, (tx) =>
      tx.user.update({ where: { id: a.userId }, data: { instituteId: b.instituteId } }),
    );

    await expect(attempt).rejects.toThrow(/row-level security/);
  });

  test("tenant A cannot link its rows to tenant B's records (composite foreign keys)", async () => {
    const attempt = withTenant(a.instituteId, (tx) =>
      tx.studentEnrollment.create({
        data: {
          instituteId: a.instituteId,
          studentId: a.studentId,
          academicYearId: a.academicYearId,
          sectionId: b.sectionId,
          rollNo: 1,
        },
      }),
    );

    await expect(attempt).rejects.toMatchObject({ code: 'P2003' });
  });

  test('writes without a tenant context are rejected', async () => {
    const attempt = prisma.subject.create({
      data: { instituteId: a.instituteId, name: 'Orphan', code: 'ORP' },
    });

    await expect(attempt).rejects.toThrow(/row-level security/);
  });
});

describe('platform lookup', () => {
  test('resolves an institute by code but still sees no tenant data', async () => {
    const seen = await withPlatform(async (tx) => ({
      institute: await tx.institute.findUnique({ where: { slug: b.slug }, select: { id: true } }),
      students: await tx.student.count(),
      users: await tx.user.count(),
    }));

    expect(seen).toEqual({ institute: { id: b.instituteId }, students: 0, users: 0 });
  });

  test('is read-only', async () => {
    const attempt = withPlatform((tx) =>
      tx.institute.update({ where: { id: b.instituteId }, data: { name: 'Renamed' } }),
    );

    await expect(attempt).rejects.toMatchObject({ code: 'P2025' });
  });
});

describe('withTenant()', () => {
  test('rejects a missing or malformed institute id', async () => {
    await expect(withTenant(undefined, async () => {})).rejects.toThrow(TypeError);
    await expect(withTenant("x' OR '1'='1", async () => {})).rejects.toThrow(TypeError);
  });

  test('the tenant setting does not leak into later queries on pooled connections', async () => {
    await withTenant(a.instituteId, (tx) => tx.student.count());
    const counts = await Promise.all(Array.from({ length: 5 }, () => prisma.student.count()));

    expect(counts).toEqual([0, 0, 0, 0, 0]);
  });

  test('concurrent transactions for different tenants stay isolated', async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) => {
        const tenant = i % 2 === 0 ? a : b;
        return withTenant(tenant.instituteId, async (tx) => ({
          expected: [tenant.studentId],
          actual: (await tx.student.findMany({ select: { id: true } })).map((s) => s.id),
        }));
      }),
    );

    for (const { expected, actual } of results) {
      expect(actual).toEqual(expected);
    }
  });
});
