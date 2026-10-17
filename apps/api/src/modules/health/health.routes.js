const { Router } = require('express');
const { validate } = require('../../middleware/validate');
const { healthQuerySchema } = require('./health.schema');
const controller = require('./health.controller');

const router = Router();

/**
 * @openapi
 * /health:
 *   get:
 *     tags: [System]
 *     summary: Readiness check (database and Redis)
 *     responses:
 *       200:
 *         description: All dependencies are reachable
 *       503:
 *         description: One or more dependencies are unavailable
 */
router.get('/', validate({ query: healthQuerySchema }), controller.ready);

/**
 * @openapi
 * /health/live:
 *   get:
 *     tags: [System]
 *     summary: Liveness check (process is up; no dependency checks)
 *     responses:
 *       200:
 *         description: Process is running
 */
router.get('/live', validate({ query: healthQuerySchema }), controller.live);

module.exports = router;
