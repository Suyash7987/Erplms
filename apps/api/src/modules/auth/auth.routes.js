const { Router } = require('express');
const { validate } = require('../../middleware/validate');
const { authenticate } = require('../../middleware/auth');
const { loginAccountLimiter, loginIpLimiter } = require('../../middleware/rateLimit');
const schema = require('./auth.schema');
const controller = require('./auth.controller');

const router = Router();

// Onboarding steps (password change, consent) and profile switching work before onboarding is done.
const signedIn = authenticate({ allowPending: true });

router.post(
  '/login',
  loginIpLimiter,
  loginAccountLimiter,
  validate({ body: schema.loginBody }),
  controller.login,
);
router.post('/refresh', validate({ body: schema.emptyBody }), controller.refresh);
router.post('/logout', validate({ body: schema.emptyBody }), controller.logout);

router.get('/me', signedIn, validate({ query: schema.emptyQuery }), controller.me);
router.post(
  '/change-password',
  signedIn,
  validate({ body: schema.changePasswordBody }),
  controller.changePassword,
);
router.post(
  '/switch-profile',
  signedIn,
  validate({ body: schema.switchProfileBody }),
  controller.switchProfile,
);
router.get('/consent', signedIn, validate({ query: schema.emptyQuery }), controller.getConsent);
router.post('/consent', signedIn, validate({ body: schema.consentBody }), controller.grantConsent);

module.exports = router;
