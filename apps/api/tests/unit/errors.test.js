const express = require('express');
const request = require('supertest');
const { z } = require('zod');

jest.mock('../../src/lib/prisma', () => ({ prisma: {} }));

const { createApp } = require('../../src/app');
const { validate } = require('../../src/middleware/validate');
const { errorHandler, notFoundHandler } = require('../../src/middleware/error');
const { AppError } = require('../../src/lib/errors');

function buildTestApp() {
  const app = express();
  app.use(express.json());

  app.post(
    '/items/:id',
    validate({
      params: z.object({ id: z.string().uuid() }),
      query: z.object({ page: z.coerce.number().int().min(1).default(1) }),
      body: z.object({ name: z.string().min(1) }).strict(),
    }),
    (req, res) => res.json({ valid: req.valid }),
  );
  app.get('/forbidden', () => {
    throw AppError.forbidden();
  });
  app.get('/boom', async () => {
    throw new Error('database password is hunter2');
  });
  app.get('/duplicate', () => {
    const error = new Error('Unique constraint failed');
    error.name = 'PrismaClientKnownRequestError';
    error.code = 'P2002';
    error.meta = { target: ['institute_id', 'phone'] };
    throw error;
  });

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

describe('error handling', () => {
  const app = buildTestApp();

  test('unknown routes return the standard error shape', async () => {
    const res = await request(createApp()).get('/api/v1/does-not-exist');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: {
        code: 'NOT_FOUND',
        message: 'Route GET /api/v1/does-not-exist not found',
        details: null,
        requestId: expect.any(String),
      },
    });
  });

  test('malformed JSON returns INVALID_JSON', async () => {
    const res = await request(createApp())
      .post('/api/v1/health')
      .set('Content-Type', 'application/json')
      .send('{"broken":');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });

  test('AppError status and code are preserved', async () => {
    const res = await request(app).get('/forbidden');

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  test('unexpected errors return a generic 500 without leaking internals', async () => {
    const res = await request(app).get('/boom');

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(res.body)).not.toContain('hunter2');
    expect(res.body.error.stack).toBeUndefined();
  });

  test('Prisma unique violations map to 409 CONFLICT', async () => {
    const res = await request(app).get('/duplicate');

    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({
      code: 'CONFLICT',
      details: { fields: ['institute_id', 'phone'] },
    });
  });
});

describe('validate middleware', () => {
  const app = buildTestApp();
  const id = '7b0f8c55-5f43-4c39-9a8e-0f6d2a7f6f10';

  test('passes parsed and coerced values on req.valid', async () => {
    const res = await request(app).post(`/items/${id}?page=3`).send({ name: 'Class 1' });

    expect(res.status).toBe(200);
    expect(res.body.valid).toEqual({
      params: { id },
      query: { page: 3 },
      body: { name: 'Class 1' },
    });
  });

  test('reports issues from every request location at once', async () => {
    const res = await request(app).post('/items/not-a-uuid?page=0').send({ name: '', extra: 1 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    const locations = res.body.error.details.map((issue) => issue.location);
    expect(locations).toEqual(expect.arrayContaining(['params', 'query', 'body']));
  });

  test('rejects unknown schema keys at definition time', () => {
    expect(() => validate({ headers: z.object({}) })).toThrow(/unknown schema keys/);
  });
});
