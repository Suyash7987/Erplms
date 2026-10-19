const fs = require('node:fs');
const path = require('node:path');
const { z } = require('zod');

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),

    DATABASE_URL: z
      .string()
      .url()
      .refine((value) => /^postgres(ql)?:\/\//.test(value), 'must be a postgres:// URL'),

    WEB_ORIGIN: z.string().url(),
    TRUST_PROXY: z.coerce.number().int().min(0).default(0),

    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),

    BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),

    APP_TIMEZONE: z.string().default('Asia/Kolkata'),
    DATA_REGION: z.string().default('local'),
  })
  .refine((env) => env.NODE_ENV !== 'production' || env.BCRYPT_ROUNDS >= 10, {
    path: ['BCRYPT_ROUNDS'],
    message: 'must be at least 10 in production',
  });

function parseEnv(source) {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }

  const env = result.data;
  return Object.freeze({
    ...env,
    isProduction: env.NODE_ENV === 'production',
    isDevelopment: env.NODE_ENV === 'development',
    isTest: env.NODE_ENV === 'test',
  });
}

function loadEnvFile() {
  const envFile = path.resolve(__dirname, '../../.env');
  if (process.env.NODE_ENV !== 'test' && fs.existsSync(envFile)) {
    process.loadEnvFile(envFile);
  }
}

loadEnvFile();

let env;
try {
  env = parseEnv(process.env);
} catch (error) {
  // Logger depends on env, so this is the one place console output is unavoidable.
  // eslint-disable-next-line no-console
  console.error(error.message);
  process.exit(1);
}

module.exports = { env, parseEnv };
