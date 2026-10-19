const { z } = require('zod');
const { paginationQuery } = require('../../lib/pagination');

const listStaffQuery = z
  .object({
    ...paginationQuery,
    q: z.string().trim().min(1).max(100).optional(),
    staffType: z.enum(['teaching', 'non_teaching']).optional(),
    status: z.enum(['active', 'inactive', 'left']).default('active'),
  })
  .strict();

module.exports = { listStaffQuery };
