const usersService = require('./users.service');

async function list(req, res) {
  res.json(await usersService.listUsers(req.ctx, req.valid.query));
}

async function resetPassword(req, res) {
  const result = await usersService.resetPassword(req.ctx, req.valid.params.userId, req.ctx.meta);
  // The temporary password is shown once; make sure no proxy or browser caches it.
  res.set('Cache-Control', 'no-store').json(result);
}

async function assignRole(req, res) {
  const user = await usersService.assignRole(
    req.ctx,
    req.valid.params.userId,
    req.valid.body.roleId,
    req.ctx.meta,
  );
  res.status(201).json(user);
}

async function removeRole(req, res) {
  const user = await usersService.removeRole(
    req.ctx,
    req.valid.params.userId,
    req.valid.params.roleId,
    req.ctx.meta,
  );
  res.json(user);
}

module.exports = { list, resetPassword, assignRole, removeRole };
