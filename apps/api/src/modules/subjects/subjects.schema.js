const { z } = require('zod');
const { paginationQuery } = require('../../lib/pagination');

const subjectName = z.string().trim().min(1).max(100);
const subjectCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9][A-Z0-9_-]{0,19}$/, 'Use up to 20 letters, digits, - or _');

const listSubjectsQuery = z
  .object({
    ...paginationQuery,
    q: z.string().trim().min(1).max(100).optional(),
    includeInactive: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional(),
  })
  .strict();

const subjectInput = z.object({ name: subjectName, code: subjectCode }).strict();

/** Accepts one subject or { subjects: [...] } for bulk creation. */
const createSubjectsBody = z.union([
  subjectInput.transform((subject) => [subject]),
  z
    .object({ subjects: z.array(subjectInput).min(1).max(50) })
    .strict()
    .transform((body) => body.subjects),
]);

const updateSubjectBody = z
  .object({
    name: subjectName.optional(),
    code: subjectCode.optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, 'Nothing to update');

const subjectParams = z.object({ subjectId: z.string().uuid() }).strict();

module.exports = { listSubjectsQuery, createSubjectsBody, updateSubjectBody, subjectParams };
