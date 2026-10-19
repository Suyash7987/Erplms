const { z } = require('zod');

// ~1 MB of CSV is roughly 2,000 rows; the JSON body limit enforces the same ceiling.
const MAX_CSV_CHARS = 1_000_000;

const importBody = z
  .object({
    csv: z.string().min(1, 'The file is empty').max(MAX_CSV_CHARS, 'The file is larger than 1 MB'),
    dryRun: z.boolean().default(true),
    skipInvalidRows: z.boolean().default(false),
    academicYearId: z.string().uuid().optional(),
  })
  .strict();

const typeParams = z.object({ type: z.enum(['students', 'staff']) }).strict();
const emptyQuery = z.object({}).strict();

module.exports = { importBody, typeParams, emptyQuery };
