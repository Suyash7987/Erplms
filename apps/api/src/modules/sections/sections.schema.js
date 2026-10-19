const { z } = require('zod');
const { paginationQuery } = require('../../lib/pagination');

const sectionName = z.string().trim().min(1).max(30);
const capacity = z.number().int().min(1).max(500).nullable();
const room = z.string().trim().max(30).nullable();
const staffId = z.string().uuid().nullable();

const listSectionsQuery = z
  .object({
    ...paginationQuery,
    academicYearId: z.string().uuid().optional(),
    levelId: z.string().uuid().optional(),
  })
  .strict();

const createSectionBody = z
  .object({
    academicYearId: z.string().uuid(),
    levelId: z.string().uuid(),
    name: sectionName,
    capacity: capacity.optional(),
    room: room.optional(),
    classTeacherStaffId: staffId.optional(),
  })
  .strict();

const createSectionGridBody = z
  .object({
    academicYearId: z.string().uuid(),
    levelIds: z.array(z.string().uuid()).min(1).max(50),
    names: z
      .array(sectionName)
      .min(1)
      .max(26)
      .transform((names) => [...new Set(names)]),
    capacity: capacity.optional(),
  })
  .strict();

const updateSectionBody = z
  .object({
    name: sectionName.optional(),
    capacity: capacity.optional(),
    room: room.optional(),
    classTeacherStaffId: staffId.optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, 'Nothing to update');

const setSectionSubjectsBody = z
  .object({
    items: z
      .array(
        z.object({ subjectId: z.string().uuid(), teacherStaffId: staffId.optional() }).strict(),
      )
      .max(30)
      .refine(
        (items) => new Set(items.map((item) => item.subjectId)).size === items.length,
        'Each subject can be listed only once',
      ),
  })
  .strict();

const sectionParams = z.object({ sectionId: z.string().uuid() }).strict();
const emptyQuery = z.object({}).strict();

module.exports = {
  listSectionsQuery,
  createSectionBody,
  createSectionGridBody,
  updateSectionBody,
  setSectionSubjectsBody,
  sectionParams,
  emptyQuery,
};
