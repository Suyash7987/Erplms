const { z } = require('zod');
const { paginationQuery } = require('../../lib/pagination');

const band = z.enum(['primary', 'middle', 'secondary', 'senior']).nullable();

const listLevelsQuery = z
  .object({
    ...paginationQuery,
    includeInactive: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional(),
  })
  .strict();

const createLevelBody = z
  .object({
    name: z.string().trim().min(1).max(60),
    code: z.string().trim().max(20).optional(),
    band: band.optional(),
    sortOrder: z.number().int().min(0).max(1000).optional(),
  })
  .strict();

const createLevelRangeBody = z
  .object({
    from: z.number().int().min(0).max(20),
    to: z.number().int().min(0).max(20),
    prefix: z.string().trim().min(1).max(30).optional(),
  })
  .strict()
  .refine((body) => body.to >= body.from, { path: ['to'], message: 'Must be at least "from"' });

const updateLevelBody = z
  .object({
    name: z.string().trim().min(1).max(60).optional(),
    code: z.string().trim().max(20).nullable().optional(),
    band: band.optional(),
    sortOrder: z.number().int().min(0).max(1000).optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, 'Nothing to update');

const levelParams = z.object({ levelId: z.string().uuid() }).strict();

module.exports = {
  listLevelsQuery,
  createLevelBody,
  createLevelRangeBody,
  updateLevelBody,
  levelParams,
};
