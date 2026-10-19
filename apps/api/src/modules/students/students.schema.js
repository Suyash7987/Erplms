const { z } = require('zod');
const { paginationQuery } = require('../../lib/pagination');
const { dateOnlySchema } = require('../../lib/dates');
const { phoneSchema } = require('../../lib/validation');

const optionalText = (max) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => value || null)
    .nullable()
    .optional();

const RELATIONS = ['father', 'mother', 'guardian', 'grandparent', 'sibling', 'other'];
const STUDENT_STATUSES = ['active', 'inactive', 'transferred', 'passed_out', 'left'];

const studentFields = {
  admissionNo: z.string().trim().min(1).max(30),
  firstName: z.string().trim().min(1).max(100),
  lastName: optionalText(100),
  gender: z.enum(['male', 'female', 'other']).nullable().optional(),
  dateOfBirth: dateOnlySchema.nullable().optional(),
  bloodGroup: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^(A|B|AB|O)[+-]$/, 'e.g. B+')
    .nullable()
    .optional(),
  admissionDate: dateOnlySchema.nullable().optional(),
  address: optionalText(300),
};

const guardianInput = z
  .object({
    name: z.string().trim().min(1).max(150),
    phone: phoneSchema,
    email: z.string().trim().email().max(254).nullable().optional(),
    occupation: optionalText(100),
    relation: z.enum(RELATIONS).default('guardian'),
    isPrimary: z.boolean().optional(),
    isFeePayer: z.boolean().optional(),
  })
  .strict();

const listStudentsQuery = z
  .object({
    ...paginationQuery,
    q: z.string().trim().min(1).max(100).optional(),
    academicYearId: z.string().uuid().optional(),
    levelId: z.string().uuid().optional(),
    sectionId: z.string().uuid().optional(),
    status: z.enum([...STUDENT_STATUSES, 'all']).default('active'),
    gender: z.enum(['male', 'female', 'other']).optional(),
  })
  .strict();

const createStudentBody = z
  .object({
    ...studentFields,
    academicYearId: z.string().uuid().optional(),
    sectionId: z.string().uuid().optional(),
    rollNo: z.number().int().min(1).max(999).nullable().optional(),
    studentPhone: phoneSchema.nullable().optional(),
    guardians: z.array(guardianInput).min(1, 'Add at least one guardian').max(3),
  })
  .strict()
  .transform(({ academicYearId, sectionId, rollNo, studentPhone, guardians, ...student }) => ({
    academicYearId,
    sectionId,
    rollNo,
    studentPhone: studentPhone ?? null,
    guardians,
    student,
  }));

const updateStudentBody = z
  .object(
    Object.fromEntries(
      Object.entries(studentFields).map(([key, schema]) => [key, schema.optional()]),
    ),
  )
  .strict()
  .refine((body) => Object.keys(body).length > 0, 'Nothing to update');

const statusBody = z
  .object({ status: z.enum(STUDENT_STATUSES), reason: z.string().trim().max(300).optional() })
  .strict();

const enrollmentBody = z
  .object({
    academicYearId: z.string().uuid().optional(),
    sectionId: z.string().uuid(),
    rollNo: z.number().int().min(1).max(999).nullable().optional(),
    status: z
      .enum(['active', 'promoted', 'detained', 'transferred', 'left', 'completed'])
      .optional(),
  })
  .strict();

const guardianLinkBody = z
  .object({
    relation: z.enum(RELATIONS).optional(),
    isPrimary: z.boolean().optional(),
    isFeePayer: z.boolean().optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, 'Nothing to update');

const studentParams = z.object({ studentId: z.string().uuid() }).strict();
const studentGuardianParams = z
  .object({ studentId: z.string().uuid(), guardianId: z.string().uuid() })
  .strict();
const emptyQuery = z.object({}).strict();

module.exports = {
  RELATIONS,
  listStudentsQuery,
  createStudentBody,
  updateStudentBody,
  statusBody,
  enrollmentBody,
  guardianInput,
  guardianLinkBody,
  studentParams,
  studentGuardianParams,
  emptyQuery,
};
