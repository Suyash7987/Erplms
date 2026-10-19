const { Router } = require('express');
const { validate } = require('../../middleware/validate');
const { healthQuerySchema } = require('./health.schema');
const controller = require('./health.controller');

const router = Router();

// Readiness: 200 when the database is reachable, 503 otherwise.
router.get('/', validate({ query: healthQuerySchema }), controller.ready);

// Liveness: the process is up; no dependency checks.
router.get('/live', validate({ query: healthQuerySchema }), controller.live);

module.exports = router;
