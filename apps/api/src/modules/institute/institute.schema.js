const { z } = require('zod');
const { TOGGLEABLE_MODULES } = require('../../config/permissions');
const { phoneSchema } = require('../../lib/validation');

const optionalText = (max) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => value || null)
    .nullable()
    .optional();

const label = z.string().trim().min(1).max(30);

/** Known settings keys. Unknown keys are rejected so typos never become silent config. */
const settingsSchema = z
  .object({
    locale: z.enum(['en', 'hi']).optional(),
    labels: z
      .object({ level: label, section: label, student: label, guardian: label })
      .partial()
      .strict()
      .optional(),
    attendance: z
      .object({
        editWindowDays: z.number().int().min(0).max(30),
        sessionsPerDay: z.union([z.literal(1), z.literal(2)]),
      })
      .partial()
      .strict()
      .optional(),
    timetable: z
      .object({
        workingDays: z
          .array(z.number().int().min(1).max(7))
          .min(1)
          .max(7)
          .transform((days) => [...new Set(days)].sort()),
      })
      .partial()
      .strict()
      .optional(),
    fees: z
      .object({
        receiptPrefix: z
          .string()
          .trim()
          .max(12)
          .regex(/^[A-Za-z0-9/-]*$/, 'Use letters, digits, / or -'),
      })
      .partial()
      .strict()
      .optional(),
  })
  .strict();

const enabledModulesSchema = z
  .object(Object.fromEntries(TOGGLEABLE_MODULES.map((module) => [module, z.boolean()])))
  .partial()
  .strict();

const updateInstituteBody = z
  .object({
    name: z.string().trim().min(2).max(200).optional(),
    board: z.enum(['CBSE', 'ICSE', 'STATE']).optional(),
    boardName: optionalText(120),
    phone: phoneSchema.nullable().optional(),
    email: z.string().trim().email().max(254).nullable().optional(),
    addressLine: optionalText(300),
    city: optionalText(100),
    state: optionalText(100),
    pincode: z
      .string()
      .trim()
      .regex(/^\d{6}$/, 'Enter a 6-digit PIN code')
      .nullable()
      .optional(),
    settings: settingsSchema.optional(),
    enabledModules: enabledModulesSchema.optional(),
  })
  .strict();

const emptyQuery = z.object({}).strict();
const emptyBody = z.object({}).strict();

module.exports = { updateInstituteBody, emptyQuery, emptyBody };
