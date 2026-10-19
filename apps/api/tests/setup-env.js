const defaults = {
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  DATABASE_URL: 'postgresql://erplms:erplms_dev_password@localhost:5432/erplms_test?schema=public',
  WEB_ORIGIN: 'http://localhost:3000',
  RATE_LIMIT_MAX: '10000',
};

for (const [key, value] of Object.entries(defaults)) {
  if (key === 'NODE_ENV' || process.env[key] === undefined) {
    process.env[key] = value;
  }
}
