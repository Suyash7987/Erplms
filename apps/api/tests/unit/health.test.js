const request = require('supertest');

const mockQueryRaw = jest.fn();

jest.mock('../../src/lib/prisma', () => ({ prisma: { $queryRaw: mockQueryRaw } }));

const { createApp } = require('../../src/app');

describe('health endpoints', () => {
  const app = createApp();

  test('GET /api/v1/health/live returns ok without touching dependencies', async () => {
    const res = await request(app).get('/api/v1/health/live');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', service: 'api', timezone: 'Asia/Kolkata' });
    expect(res.body.localTime).toMatch(/\+05:30$/);
    expect(mockQueryRaw).not.toHaveBeenCalled();
  });

  test('GET /api/v1/health returns 200 when the database is reachable', async () => {
    mockQueryRaw.mockResolvedValue([{ '?column?': 1 }]);

    const res = await request(app).get('/api/v1/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.checks.database.status).toBe('ok');
  });

  test('GET /api/v1/health returns 503 when the database is down', async () => {
    mockQueryRaw.mockRejectedValue(new Error('connection refused'));

    const res = await request(app).get('/api/v1/health');

    expect(res.status).toBe(503);
    expect(res.body.status).toBe('degraded');
    expect(res.body.checks.database).toMatchObject({ status: 'error' });
  });

  test('rejects unexpected query parameters', async () => {
    const res = await request(app).get('/api/v1/health/live?foo=bar');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details[0]).toMatchObject({ location: 'query' });
  });
});

describe('security middleware', () => {
  const app = createApp();

  test('sets helmet security headers and hides x-powered-by', async () => {
    const res = await request(app).get('/api/v1/health/live');

    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toBeDefined();
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  test('allows CORS only for the configured web origin', async () => {
    const allowed = await request(app)
      .get('/api/v1/health/live')
      .set('Origin', 'http://localhost:3000');
    const blocked = await request(app)
      .get('/api/v1/health/live')
      .set('Origin', 'https://evil.example.com');

    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');
    expect(blocked.headers['access-control-allow-origin']).not.toBe('https://evil.example.com');
  });

  test('echoes a valid X-Request-Id and generates one otherwise', async () => {
    const echoed = await request(app)
      .get('/api/v1/health/live')
      .set('X-Request-Id', 'abc12345-test');
    const generated = await request(app).get('/api/v1/health/live').set('X-Request-Id', 'bad id!');

    expect(echoed.headers['x-request-id']).toBe('abc12345-test');
    expect(generated.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  test('returns the standard error shape for unknown routes', async () => {
    const res = await request(app).get('/api/v1/does-not-exist');

    expect(res.status).toBe(404);
    expect(res.body.error).toMatchObject({ code: 'NOT_FOUND', details: null });
    expect(res.body.error.stack).toBeUndefined();
  });
});
