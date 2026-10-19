const instituteService = require('./institute.service');

async function get(req, res) {
  res.json(await instituteService.getInstitute(req.ctx));
}

async function update(req, res) {
  res.json(await instituteService.updateInstitute(req.ctx, req.valid.body, req.ctx.meta));
}

async function setupStatus(req, res) {
  res.json(await instituteService.getSetupStatus(req.ctx));
}

async function confirmProfile(req, res) {
  res.json(await instituteService.confirmProfile(req.ctx, req.valid.body, req.ctx.meta));
}

async function completeSetup(req, res) {
  res.json(await instituteService.completeSetup(req.ctx, req.ctx.meta));
}

module.exports = { get, update, setupStatus, confirmProfile, completeSetup };
