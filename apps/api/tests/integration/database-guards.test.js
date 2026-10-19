const { prisma, withTenant } = require('../../src/lib/prisma');
const { createTenant, createLedger, date } = require('../helpers/fixtures');

let tenant;
let ledger;

beforeAll(async () => {
  tenant = await createTenant('Guard');
  ledger = await createLedger(tenant);
});

afterAll(() => prisma.$disconnect());

const inTenant = (work) => withTenant(tenant.instituteId, work);

describe('Row Level Security coverage', () => {
  test('every tenant table has RLS enabled, forced and at least one policy', async () => {
    const tables = await prisma.$queryRaw`
      SELECT c.relname AS name,
             c.relrowsecurity AS enabled,
             c.relforcerowsecurity AS forced,
             (SELECT count(*)::int FROM pg_policies p
               WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS policies
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'r'
         AND (c.relname = 'institutes' OR EXISTS (
               SELECT 1 FROM information_schema.columns col
                WHERE col.table_schema = 'public'
                  AND col.table_name = c.relname
                  AND col.column_name = 'institute_id'))
       ORDER BY c.relname`;

    const unprotected = tables
      .filter((table) => !table.enabled || !table.forced || table.policies === 0)
      .map((table) => table.name);

    expect(tables.length).toBeGreaterThanOrEqual(35);
    expect(unprotected).toEqual([]);
  });

  test('the only tables without institute_id are permissions and Prisma migrations', async () => {
    const rows = await prisma.$queryRaw`
      SELECT t.table_name AS name
        FROM information_schema.tables t
       WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
         AND t.table_name <> 'institutes'
         AND NOT EXISTS (
               SELECT 1 FROM information_schema.columns col
                WHERE col.table_schema = 'public'
                  AND col.table_name = t.table_name
                  AND col.column_name = 'institute_id')
       ORDER BY t.table_name`;

    expect(rows.map((row) => row.name)).toEqual(['_prisma_migrations', 'permissions']);
  });
});

describe('append-only ledgers', () => {
  test('payments cannot be updated or deleted', async () => {
    await expect(
      inTenant((tx) =>
        tx.payment.update({ where: { id: ledger.paymentId }, data: { amountPaise: 1n } }),
      ),
    ).rejects.toThrow(/payments is append-only: UPDATE/);

    await expect(
      inTenant((tx) => tx.payment.delete({ where: { id: ledger.paymentId } })),
    ).rejects.toThrow(/payments is append-only: DELETE/);
  });

  test('a payment is corrected with a reversal entry, which is also append-only', async () => {
    const reversal = await inTenant((tx) =>
      tx.paymentReversal.create({
        data: {
          instituteId: tenant.instituteId,
          paymentId: ledger.paymentId,
          amountPaise: 500_000n,
          reason: 'Entered against the wrong student',
          reversedByUserId: tenant.userId,
          reversedOn: date('2026-04-06'),
        },
      }),
    );

    await expect(
      inTenant((tx) => tx.paymentReversal.delete({ where: { id: reversal.id } })),
    ).rejects.toThrow(/payment_reversals is append-only: DELETE/);
  });

  test('audit logs cannot be updated or deleted', async () => {
    await expect(
      inTenant((tx) =>
        tx.auditLog.update({ where: { id: ledger.auditLogId }, data: { action: 'tampered' } }),
      ),
    ).rejects.toThrow(/audit_logs is append-only: UPDATE/);

    await expect(inTenant((tx) => tx.auditLog.deleteMany({}))).rejects.toThrow(
      /audit_logs is append-only: DELETE/,
    );
  });
});

describe('check constraints', () => {
  const payment = (overrides) => ({
    instituteId: tenant.instituteId,
    academicYearId: tenant.academicYearId,
    studentId: tenant.studentId,
    invoiceId: ledger.invoiceId,
    receiptSeq: 99,
    receiptNo: 'TEST/2026-27/000099',
    amountPaise: 100n,
    mode: 'cash',
    paidOn: date('2026-04-05'),
    collectedByUserId: tenant.userId,
    ...overrides,
  });

  test('payments must be positive', async () => {
    await expect(
      inTenant((tx) => tx.payment.create({ data: payment({ amountPaise: 0n }) })),
    ).rejects.toThrow(/payments_amount_positive/);
  });

  test('non-cash payments need a reference number', async () => {
    await expect(
      inTenant((tx) => tx.payment.create({ data: payment({ mode: 'upi_manual' }) })),
    ).rejects.toThrow(/payments_reference_required/);
  });

  test('receipt numbers are unique per institute and academic year', async () => {
    await expect(
      inTenant((tx) => tx.payment.create({ data: payment({ receiptSeq: 1 }) })),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  test('invoice totals must add up and paid cannot exceed net', async () => {
    const invoice = (overrides) => ({
      instituteId: tenant.instituteId,
      academicYearId: tenant.academicYearId,
      studentId: tenant.studentId,
      installmentNo: 2,
      dueDate: date('2026-07-10'),
      grossPaise: 1_000n,
      concessionPaise: 100n,
      finePaise: 50n,
      netPaise: 950n,
      ...overrides,
    });

    await expect(
      inTenant((tx) => tx.studentFeeInvoice.create({ data: invoice({ netPaise: 1_000n }) })),
    ).rejects.toThrow(/student_fee_invoices_net_matches/);
    await expect(
      inTenant((tx) => tx.studentFeeInvoice.create({ data: invoice({ paidPaise: 951n }) })),
    ).rejects.toThrow(/student_fee_invoices_paid_range/);
  });

  test('a leave belongs to exactly one student or staff member', async () => {
    await expect(
      inTenant((tx) =>
        tx.leave.create({
          data: {
            instituteId: tenant.instituteId,
            academicYearId: tenant.academicYearId,
            fromDate: date('2026-05-01'),
            toDate: date('2026-05-02'),
            reason: 'Fever',
            appliedByUserId: tenant.userId,
          },
        }),
      ),
    ).rejects.toThrow(/leaves_one_applicant/);
  });
});

describe('attendance uniqueness', () => {
  test('a student has at most one record per date per session', async () => {
    const day = date('2026-06-15');
    const markIn = (sectionId) =>
      inTenant(async (tx) => {
        const session = await tx.attendanceSession.create({
          data: {
            instituteId: tenant.instituteId,
            academicYearId: tenant.academicYearId,
            sectionId,
            date: day,
          },
        });
        return tx.attendanceRecord.create({
          data: {
            instituteId: tenant.instituteId,
            attendanceSessionId: session.id,
            studentId: tenant.studentId,
            date: day,
            session: 'full_day',
            status: 'present',
          },
        });
      });

    await markIn(tenant.sectionId);

    await expect(markIn(tenant.otherSectionId)).rejects.toMatchObject({ code: 'P2002' });
  });

  test("a record's date must match its attendance session", async () => {
    const attempt = inTenant(async (tx) => {
      const session = await tx.attendanceSession.create({
        data: {
          instituteId: tenant.instituteId,
          academicYearId: tenant.academicYearId,
          sectionId: tenant.sectionId,
          date: date('2026-06-16'),
        },
      });
      return tx.attendanceRecord.create({
        data: {
          instituteId: tenant.instituteId,
          attendanceSessionId: session.id,
          studentId: tenant.studentId,
          date: date('2026-06-17'),
          session: 'full_day',
          status: 'absent',
        },
      });
    });

    await expect(attempt).rejects.toMatchObject({ code: 'P2003' });
  });
});
