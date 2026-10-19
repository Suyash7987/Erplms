const { Router } = require('express');
const { apiRateLimiter } = require('./middleware/rateLimit');
const healthRoutes = require('./modules/health/health.routes');
const authRoutes = require('./modules/auth/auth.routes');
const usersRoutes = require('./modules/users/users.routes');
const rolesRoutes = require('./modules/roles/roles.routes');

const router = Router();

// Health checks are polled by load balancers and must not consume the per-IP budget.
router.use('/health', healthRoutes);

router.use(apiRateLimiter);

router.use('/auth', authRoutes);
router.use('/users', usersRoutes);
router.use('/roles', rolesRoutes);

module.exports = router;
