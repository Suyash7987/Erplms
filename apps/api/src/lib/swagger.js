const path = require('node:path');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const pkg = require('../../package.json');

const toGlob = (...segments) => path.join(__dirname, ...segments).replace(/\\/g, '/');

const openapiSpec = swaggerJsdoc({
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'School ERP API',
      version: pkg.version,
      description:
        'Multi-tenant School ERP + LMS REST API. All timestamps are UTC ISO-8601; calendar dates are in the institute timezone (IST by default).',
    },
    servers: [{ url: '/api/v1' }],
    components: {
      schemas: {
        Error: {
          type: 'object',
          required: ['error'],
          properties: {
            error: {
              type: 'object',
              required: ['code', 'message'],
              properties: {
                code: { type: 'string', example: 'VALIDATION_ERROR' },
                message: { type: 'string', example: 'Request validation failed' },
                details: { nullable: true },
                requestId: { type: 'string', example: '6f1c1e0e-3b8f-4c0e-9f43-2b0a8f7b1f55' },
              },
            },
          },
        },
      },
      responses: {
        ValidationError: {
          description: 'Request validation failed',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
        },
        RateLimited: {
          description: 'Too many requests',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
        },
      },
    },
  },
  apis: [toGlob('../modules/**/*.routes.js')],
});

function mountDocs(app) {
  app.get('/api/v1/docs.json', (_req, res) => res.json(openapiSpec));
  app.use(
    '/api/v1/docs',
    swaggerUi.serve,
    swaggerUi.setup(openapiSpec, { customSiteTitle: 'School ERP API docs' }),
  );
}

module.exports = { openapiSpec, mountDocs };
