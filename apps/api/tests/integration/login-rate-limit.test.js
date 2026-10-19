// Must be set before the app (and its in-memory limiters) are loaded.
process.env.LOGIN_RATE_LIMIT_PER_ACCOUNT = '3';

const request = require('supertest');
const { createApp } = require('../../src/app');
const { prisma } = require('../../src/lib/prisma');

afterAll(() => prisma.$disconnect());

test('login is rate limited per account (IP + institute + phone)', async () => {
  const app = createApp();
  const attempt = (phone) =>
    request(app)
      .post('/api/v1/auth/login')
      .send({ instituteCode: 'nowhere', phone, password: 'Wrong@Pass1' });

  const statuses = [];
  for (let i = 0; i < 4; i += 1) statuses.push((await attempt('9876500001')).status);
  const blocked = await attempt('9876500001');
  const otherAccount = await attempt('9876500002');

  expect(statuses).toEqual([401, 401, 401, 429]);
  expect(blocked.body.error).toMatchObject({ code: 'RATE_LIMITED' });
  expect(otherAccount.status).toBe(401);
});
