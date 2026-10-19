const { z } = require('zod');
const { paginationQuery } = require('../../lib/pagination');
const { dateOnlySchema } = require('../../lib/dates');
const { phoneSchema } = require('../../lib/validation');

const optionalText = (max) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => value || null)
    .nullable()
    .optional();

const roleCode = z.string().regex(/^[a-z][a-z0-9_]{1,49}$/);

const listStaffQuery = z
  .object({
    ...paginationQuery,
    q: z.string().trim().min(1).max(100).optional(),
    staffType: z.enum(['teaching', 'non_teaching']).optional(),
    status: z.enum(['active', 'inactive', 'left', 'all']).default('active'),
  })
  .strict();

const createStaffBody = z
  .object({
    employeeCode: z.string().trim().min(1).max(30),
    name: z.string().trim().min(1).max(150),
    phone: phoneSchema,
    email: z.string().trim().email().max(254).nullable().optional(),
    designation: optionalText(100),
    department: optionalText(100),
    staffType: z.enum(['teaching', 'non_teaching']).default('teaching'),
    joiningDate: dateOnlySchema.nullable().optional(),
    roleCodes: z
      .array(roleCode.refine((code) => code !== 'parent' && code !== 'student', 'Not a staff role'))
      .min(1)
      .max(5)
      .default(['teacher'])
      .transform((codes) => [...new Set(codes)]),
  })
  .strict();

const updateStaffBody = z
  .object({
    name: z.string().trim().min(1).max(150).optional(),
    email: z.string().trim().email().max(254).nullable().optional(),
    designation: optionalText(100),
    department: optionalText(100),
    staffType: z.enum(['teaching', 'non_teaching']).optional(),
    joiningDate: dateOnlySchema.nullable().optional(),
    status: z.enum(['active', 'inactive', 'left']).optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, 'Nothing to update');

const staffParams = z.object({ staffId: z.string().uuid() }).strict();
const emptyQuery = z.object({}).strict();

module.exports = { listStaffQuery, createStaffBody, updateStaffBody, staffParams, emptyQuery };
