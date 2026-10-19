const rolesService = require('./roles.service');
const { requestMeta } = require('../../lib/audit');

async function listPermissions(_req, res) {
  res.json({ data: await rolesService.listPermissions() });
}

async function list(req, res) {
  res.json(await rolesService.listRoles(req.ctx, req.valid.query));
}

async function create(req, res) {
  const role = await rolesService.createRole(req.ctx, req.valid.body, requestMeta(req));
  res.status(201).json(role);
}

async function updatePermissions(req, res) {
  const role = await rolesService.updateRolePermissions(
    req.ctx,
    req.valid.params.roleId,
    req.valid.body.permissions,
    requestMeta(req),
  );
  res.json(role);
}

module.exports = { listPermissions, list, create, updatePermissions };
