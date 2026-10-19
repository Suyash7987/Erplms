const fs = require('node:fs');
const path = require('node:path');

const prismaDir = path.resolve(__dirname, '../../prisma');
const read = (file) => fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');

const rlsSql = read(path.join(prismaDir, 'rls.sql'));

function tenantTablesFromSchema() {
  const schema = read(path.join(prismaDir, 'schema.prisma'));
  return schema
    .split(/^model /m)
    .slice(1)
    .filter((block) => /^\s+instituteId\s/m.test(block))
    .map((block) => block.match(/@@map\("([^"]+)"\)/)[1]);
}

describe('prisma/rls.sql', () => {
  test('is applied verbatim by the tenant_rls migration', () => {
    const migrationDirs = fs
      .readdirSync(path.join(prismaDir, 'migrations'))
      .filter((name) => name.endsWith('_tenant_rls'));

    expect(migrationDirs).toHaveLength(1);
    expect(read(path.join(prismaDir, 'migrations', migrationDirs[0], 'migration.sql'))).toBe(
      rlsSql,
    );
  });

  test('enables RLS for every model that has an instituteId', () => {
    const tables = tenantTablesFromSchema();
    const missing = tables.filter(
      (table) =>
        !rlsSql.includes(`app_enable_tenant_rls('${table}')`) &&
        !rlsSql.includes(`app_enable_append_only_rls('${table}')`),
    );

    expect(tables.length).toBeGreaterThanOrEqual(34);
    expect(missing).toEqual([]);
  });

  test('keeps the money and audit tables append-only', () => {
    for (const table of ['payments', 'payment_reversals', 'audit_logs']) {
      expect(rlsSql).toContain(`app_enable_append_only_rls('${table}')`);
    }
  });
});
