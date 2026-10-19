/**
 * In-app notifications (no SMS, email or push). Rows are written in the caller's tenant
 * transaction so a notification only exists if the change that caused it was saved.
 *
 * @param {import('@prisma/client').Prisma.TransactionClient} tx
 * @param {string} instituteId
 * @param {{ userId: string, title: string, body: string, type: string,
 *   entityType?: string, entityId?: string }[]} notifications
 * @returns {Promise<number>} how many were created
 */
async function notifyUsers(tx, instituteId, notifications) {
  if (!notifications.length) return 0;
  const { count } = await tx.notification.createMany({
    data: notifications.map((notification) => ({ instituteId, ...notification })),
  });
  return count;
}

module.exports = { notifyUsers };
