const { Router } = require('express');
const { apiRateLimiter } = require('./middleware/rateLimit');
const healthRoutes = require('./modules/health/health.routes');

const router = Router();

// Health checks are polled by load balancers and must not consume the per-IP budget.
router.use('/health', healthRoutes);

router.use(apiRateLimiter);

module.exports = router;
