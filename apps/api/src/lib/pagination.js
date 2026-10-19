const { z } = require('zod');

const MAX_LIMIT = 100;

/** Spread into a list endpoint's Zod query schema: `z.object({ ...paginationQuery, q: ... })`. */
const paginationQuery = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(20),
};

function toSkipTake({ page, limit }) {
  return { skip: (page - 1) * limit, take: limit };
}

/** Standard list response: { data, meta: { page, limit, total, totalPages } } */
function pageResult(data, total, { page, limit }) {
  return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

module.exports = { paginationQuery, toSkipTake, pageResult };
