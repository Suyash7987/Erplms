const { z } = require('zod');
const { paginationQuery } = require('../../lib/pagination');

const permissionCodes = z
  .array(z.string().regex(/^[a-z]+\.[a-z_]+$/, 'Invalid permission code'))
  .max(200)
  .transform((codes) => [...new Set(codes)]);

const listRolesQuery = z.object({ ...paginationQuery }).strict();

const createRoleBody = z
  .object({
    code: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z][a-z0-9_]{1,49}$/, 'Use 2-50 lowercase letters, digits or underscores'),
    name: z.string().trim().min(2).max(100),
    description: z.string().trim().max(300).optional(),
    permissions: permissionCodes,
  })
  .strict();

const roleParams = z.object({ roleId: z.string().uuid() }).strict();

const updateRolePermissionsBody = z.object({ permissions: permissionCodes }).strict();

const emptyQuery = z.object({}).strict();

module.exports = {
  listRolesQuery,
  createRoleBody,
  roleParams,
  updateRolePermissionsBody,
  emptyQuery,
};
