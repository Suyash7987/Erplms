const { z } = require('zod');
const { paginationQuery } = require('../../lib/pagination');

const listUsersQuery = z
  .object({
    ...paginationQuery,
    q: z.string().trim().min(1).max(100).optional(),
    role: z
      .string()
      .regex(/^[a-z][a-z0-9_]{1,49}$/)
      .optional(),
    status: z.enum(['active', 'disabled']).optional(),
  })
  .strict();

const userParams = z.object({ userId: z.string().uuid() }).strict();

const userRoleParams = z.object({ userId: z.string().uuid(), roleId: z.string().uuid() }).strict();

const assignRoleBody = z.object({ roleId: z.string().uuid() }).strict();

const emptyBody = z.object({}).strict();

module.exports = { listUsersQuery, userParams, userRoleParams, assignRoleBody, emptyBody };
