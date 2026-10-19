/**
 * Audit trail for logins, password changes, role changes and (later) fees, payments, attendance
 * edits and student record changes. Rows are append-only (enforced in the database).
 * Always write the audit row in the same transaction as the change it describes.
 */

/** Request details recorded with every audit row. */
function requestMeta(req) {
  return {
    ip: req.ip ?? null,
    userAgent: req.get('user-agent')?.slice(0, 300) ?? null,
    requestId: typeof req.id === 'string' ? req.id : null,
  };
}

// BigInt (paise) and Date values are not JSON; store them as strings.
function toJson(value) {
  if (value === undefined || value === null) return undefined;
  return JSON.parse(JSON.stringify(value, (_key, v) => (typeof v === 'bigint' ? v.toString() : v)));
}

/**
 * @param {import('@prisma/client').Prisma.TransactionClient} tx tenant transaction
 * @param {{ instituteId: string, userId?: string|null, action: string, entity: string,
 *   entityId?: string|null, before?: unknown, after?: unknown,
 *   meta?: { ip?: string|null, userAgent?: string|null, requestId?: string|null } }} entry
 */
function recordAudit(tx, { instituteId, userId, action, entity, entityId, before, after, meta }) {
  return tx.auditLog.create({
    data: {
      instituteId,
      userId: userId ?? null,
      action,
      entity,
      entityId: entityId ?? null,
      before: toJson(before),
      after: toJson(after),
      ip: meta?.ip ?? null,
      userAgent: meta?.userAgent ?? null,
      requestId: meta?.requestId ?? null,
    },
  });
}

module.exports = { recordAudit, requestMeta };
