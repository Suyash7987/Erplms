const { z } = require('zod');
const { paginationQuery } = require('../../lib/pagination');

const optionalText = (max) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => value || null)
    .nullable()
    .optional();

const listGuardiansQuery = z
  .object({ ...paginationQuery, q: z.string().trim().min(1).max(100).optional() })
  .strict();

const updateGuardianBody = z
  .object({
    name: z.string().trim().min(1).max(150).optional(),
    email: z.string().trim().email().max(254).nullable().optional(),
    occupation: optionalText(100),
    address: optionalText(300),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, 'Nothing to update');

const guardianParams = z.object({ guardianId: z.string().uuid() }).strict();
const emptyQuery = z.object({}).strict();

module.exports = { listGuardiansQuery, updateGuardianBody, guardianParams, emptyQuery };
