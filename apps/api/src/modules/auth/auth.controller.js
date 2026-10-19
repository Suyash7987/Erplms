const authService = require('./auth.service');
const { requestMeta } = require('../../lib/audit');
const {
  REFRESH_COOKIE,
  setAuthCookies,
  setAccessCookie,
  clearAuthCookies,
} = require('../../lib/cookies');

const refreshCookie = (req) => req.cookies?.[REFRESH_COOKIE];

async function login(req, res) {
  const { tokens, session } = await authService.login(req.valid.body, requestMeta(req));
  setAuthCookies(res, tokens);
  res.json(session);
}

async function refresh(req, res) {
  try {
    const { tokens, session } = await authService.refresh(refreshCookie(req), requestMeta(req));
    setAuthCookies(res, tokens);
    res.json(session);
  } catch (error) {
    if (error.code === 'SESSION_EXPIRED') clearAuthCookies(res);
    throw error;
  }
}

async function logout(req, res) {
  await authService.logout(refreshCookie(req), requestMeta(req));
  clearAuthCookies(res);
  res.status(204).end();
}

async function me(req, res) {
  res.json(await authService.getSession(req.ctx));
}

async function changePassword(req, res) {
  const { tokens, session } = await authService.changePassword(
    req.ctx,
    req.valid.body,
    req.ctx.meta,
  );
  setAuthCookies(res, tokens);
  res.json(session);
}

async function switchProfile(req, res) {
  const { tokens, session } = await authService.switchProfile(
    req.ctx,
    req.valid.body.profileKey,
    refreshCookie(req),
    req.ctx.meta,
  );
  setAuthCookies(res, tokens);
  res.json(session);
}

async function getConsent(req, res) {
  res.json(await authService.getConsent(req.ctx));
}

async function grantConsent(req, res) {
  const { accessToken, session } = await authService.grantConsent(
    req.ctx,
    req.valid.body,
    req.ctx.meta,
  );
  setAccessCookie(res, accessToken);
  res.json(session);
}

module.exports = {
  login,
  refresh,
  logout,
  me,
  changePassword,
  switchProfile,
  getConsent,
  grantConsent,
};
