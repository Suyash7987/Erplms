const { z } = require('zod');

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour HH:MM, e.g. 08:30');
const dayOfWeek = z.coerce.number().int().min(1).max(7);

const yearQuery = z.object({ academicYearId: z.string().uuid().optional() }).strict();

const replacePeriodsBody = z
  .object({
    academicYearId: z.string().uuid().optional(),
    periods: z
      .array(
        z
          .object({
            id: z.string().uuid().optional(),
            name: z.string().trim().min(1).max(30),
            startTime: time,
            endTime: time,
            isBreak: z.boolean().default(false),
          })
          .strict(),
      )
      .max(15, 'At most 15 periods a day')
      .refine(
        (periods) => {
          const ids = periods.map((p) => p.id).filter(Boolean);
          return new Set(ids).size === ids.length;
        },
        { message: 'A period is listed twice' },
      ),
  })
  .strict();

const setSlotBody = z
  .object({
    sectionId: z.string().uuid(),
    dayOfWeek,
    periodId: z.string().uuid(),
    subjectId: z.string().uuid(),
    // Omit to use the teacher assigned to the subject for this section; null for no teacher.
    teacherStaffId: z.string().uuid().nullable().optional(),
    room: z.string().trim().max(30).nullable().optional(),
  })
  .strict();

const availabilityQuery = z.object({ dayOfWeek, periodId: z.string().uuid() }).strict();
const sectionParams = z.object({ sectionId: z.string().uuid() }).strict();
const staffParams = z.object({ staffId: z.string().uuid() }).strict();
const slotParams = z.object({ slotId: z.string().uuid() }).strict();
const emptyQuery = z.object({}).strict();

module.exports = {
  yearQuery,
  replacePeriodsBody,
  setSlotBody,
  availabilityQuery,
  sectionParams,
  staffParams,
  slotParams,
  emptyQuery,
};
