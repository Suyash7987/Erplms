const { z } = require('zod');
const { phoneSchema, strongPasswordSchema, instituteCodeSchema } = require('../../lib/validation');

const loginBody = z
  .object({
    instituteCode: instituteCodeSchema,
    phone: phoneSchema,
    password: z.string().min(1, 'Enter your password').max(128),
  })
  .strict();

const changePasswordBody = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password').max(128),
    newPassword: strongPasswordSchema,
  })
  .strict();

const switchProfileBody = z
  .object({
    profileKey: z.string().regex(/^[0-9a-f-]{36}:([0-9a-f-]{36})?$/i, 'Invalid profile'),
  })
  .strict();

const consentBody = z
  .object({
    version: z.string().min(1).max(20),
    accept: z.literal(true, { errorMap: () => ({ message: 'Consent must be accepted' }) }),
  })
  .strict();

const emptyBody = z.object({}).strict();
const emptyQuery = z.object({}).strict();

module.exports = {
  loginBody,
  changePasswordBody,
  switchProfileBody,
  consentBody,
  emptyBody,
  emptyQuery,
};
