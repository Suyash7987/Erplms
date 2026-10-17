const healthService = require('./health.service');

function live(_req, res) {
  res.json(healthService.liveness());
}

async function ready(_req, res) {
  const report = await healthService.readiness();
  res.status(report.status === 'ok' ? 200 : 503).json(report);
}

module.exports = { live, ready };
