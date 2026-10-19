const { z } = require('zod');
const { paginationQuery } = require('../../lib/pagination');
const { dateOnlySchema } = require('../../lib/dates');

const yearName = z.string().trim().min(4, 'e.g. 2026-27').max(20);

const listYearsQuery = z
  .object({ ...paginationQuery, status: z.enum(['upcoming', 'current', 'closed']).optional() })
  .strict();

const createYearBody = z
  .object({
    name: yearName,
    startDate: dateOnlySchema,
    endDate: dateOnlySchema,
    makeCurrent: z.boolean().default(false),
  })
  .strict();

const updateYearBody = z
  .object({
    name: yearName.optional(),
    startDate: dateOnlySchema.optional(),
    endDate: dateOnlySchema.optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, 'Nothing to update');

const yearParams = z.object({ yearId: z.string().uuid() }).strict();
const emptyBody = z.object({}).strict();

module.exports = { listYearsQuery, createYearBody, updateYearBody, yearParams, emptyBody };
