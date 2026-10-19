const { randomUUID } = require('node:crypto');
const { withTenant } = require('../../src/lib/prisma');

const date = (isoDate) => new Date(`${isoDate}T00:00:00.000Z`);

/**
 * Creates an institute with one academic year, level, two sections, a user and a student.
 * Every tenant uses the same phone and admission number to prove uniqueness is per institute.
 */
async function createTenant(label) {
  const instituteId = randomUUID();
  const slug = `${label.toLowerCase()}-${instituteId.slice(0, 8)}`;

  return withTenant(instituteId, async (tx) => {
    await tx.institute.create({
      data: { id: instituteId, name: `${label} School`, slug, board: 'CBSE' },
    });
    const academicYear = await tx.academicYear.create({
      data: {
        instituteId,
        name: '2026-27',
        startDate: date('2026-04-01'),
        endDate: date('2027-03-31'),
        status: 'current',
      },
    });
    const level = await tx.level.create({
      data: { instituteId, name: 'Class 1', band: 'primary', sortOrder: 1 },
    });
    const createSection = (name) =>
      tx.section.create({
        data: { instituteId, academicYearId: academicYear.id, levelId: level.id, name },
      });
    const sectionA = await createSection('A');
    const sectionB = await createSection('B');
    const user = await tx.user.create({
      data: {
        instituteId,
        phone: '9876543210',
        name: `${label} Admin`,
        passwordHash: 'not-a-real-hash',
      },
    });
    const student = await tx.student.create({
      data: {
        instituteId,
        academicYearId: academicYear.id,
        admissionNo: 'ADM001',
        firstName: `${label}Student`,
      },
    });

    return {
      instituteId,
      slug,
      academicYearId: academicYear.id,
      levelId: level.id,
      sectionId: sectionA.id,
      otherSectionId: sectionB.id,
      userId: user.id,
      studentId: student.id,
    };
  });
}

/** Adds an invoice, a cash payment and an audit log row to an existing tenant. */
async function createLedger(tenant) {
  const { instituteId, academicYearId, studentId, userId } = tenant;
  return withTenant(instituteId, async (tx) => {
    const invoice = await tx.studentFeeInvoice.create({
      data: {
        instituteId,
        academicYearId,
        studentId,
        dueDate: date('2026-04-10'),
        grossPaise: 1_500_000n,
        netPaise: 1_500_000n,
        paidPaise: 500_000n,
        status: 'partially_paid',
      },
    });
    const payment = await tx.payment.create({
      data: {
        instituteId,
        academicYearId,
        studentId,
        invoiceId: invoice.id,
        receiptSeq: 1,
        receiptNo: 'TEST/2026-27/000001',
        amountPaise: 500_000n,
        mode: 'cash',
        paidOn: date('2026-04-05'),
        collectedByUserId: userId,
      },
    });
    const auditLog = await tx.auditLog.create({
      data: {
        instituteId,
        userId,
        action: 'payment.create',
        entity: 'payment',
        entityId: payment.id,
      },
    });
    return { invoiceId: invoice.id, paymentId: payment.id, auditLogId: auditLog.id };
  });
}

module.exports = { createTenant, createLedger, date };
