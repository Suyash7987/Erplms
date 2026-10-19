const importsService = require('./imports.service');

async function template(req, res) {
  const { type } = req.valid.params;
  res
    .type('text/csv; charset=utf-8')
    .attachment(`${type}-import-template.csv`)
    .send(`\uFEFF${importsService.template(type)}\r\n`);
}

async function run(req, res) {
  const result = await importsService.runImport(
    req.ctx,
    req.valid.params.type,
    req.valid.body,
    req.ctx.meta,
  );
  // Commit results contain temporary passwords.
  res.set('Cache-Control', 'no-store').json(result);
}

module.exports = { template, run };
