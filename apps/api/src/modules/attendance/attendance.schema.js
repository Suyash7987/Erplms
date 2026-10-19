const { z } = require('zod');
const { dateOnlySchema } = require('../../lib/dates');

const session = z.enum(['full_day', 'morning', 'afternoon']);
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use YYYY-MM');
const STATUSES = ['present', 'absent', 'late', 'half_day', 'on_leave'];

const rosterQuery = z
  .object({
    sectionId: z.string().uuid(),
    date: dateOnlySchema.optional(),
    session: session.optional(),
  })
  .strict();

const saveBody = z
  .object({
    sectionId: z.string().uuid(),
    date: dateOnlySchema.optional(),
    session: session.optional(),
    records: z
      .array(
        z
          .object({
            studentId: z.string().uuid(),
            status: z.enum(STATUSES),
            remark: z
              .string()
              .trim()
              .max(200)
              .transform((value) => value || null)
              .nullable()
              .optional(),
          })
          .strict(),
      )
      .max(500)
      .refine(
        (records) => new Set(records.map((r) => r.studentId)).size === records.length,
        'Each student can appear only once',
      ),
  })
  .strict();

const dailyQuery = z.object({ date: dateOnlySchema.optional() }).strict();
const monthlyQuery = z.object({ sectionId: z.string().uuid(), month: month.optional() }).strict();
const myQuery = z.object({ month: month.optional() }).strict();
const emptyQuery = z.object({}).strict();

module.exports = { rosterQuery, saveBody, dailyQuery, monthlyQuery, myQuery, emptyQuery };
