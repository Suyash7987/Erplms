const { withTenant } = require('../../lib/prisma');
const { AppError } = require('../../lib/errors');
const { recordAudit } = require('../../lib/audit');
const { parseCsvRecords, toCsv } = require('../../lib/csv');
const { createTemporaryCredentials } = require('../../lib/password');
const accounts = require('../users/accounts.service');
const studentsImporter = require('./students.importer');
const staffImporter = require('./staff.importer');

const IMPORTERS = { students: studentsImporter, staff: staffImporter };

const MAX_REPORTED_ISSUES = 500;
const PREVIEW_ROWS = 50;

function importerFor(type) {
  const importer = IMPORTERS[type];
  if (!importer) throw AppError.notFound('Unknown import type');
  return importer;
}

/** CSV template with the header row and one example row. */
function template(type) {
  const { COLUMNS } = importerFor(type);
  return toCsv([COLUMNS.map((c) => c.key), COLUMNS.map((c) => c.example ?? '')]);
}

function flattenIssues(rows, key) {
  return rows
    .flatMap((row) => row[key].map((issue) => ({ row: row.rowNumber, ...issue })))
    .slice(0, MAX_REPORTED_ISSUES);
}

function buildReport(importer, analysis, { dryRun }) {
  const valid = analysis.rows.filter((row) => !row.errors.length);
  return {
    dryRun,
    type: importer.type,
    academicYear: analysis.year ? { id: analysis.year.id, name: analysis.year.name } : undefined,
    totalRows: analysis.rows.length,
    validRows: valid.length,
    invalidRows: analysis.rows.length - valid.length,
    errors: flattenIssues(analysis.rows, 'errors'),
    warnings: flattenIssues(analysis.rows, 'warnings'),
    summary: importer.summarize(analysis, valid),
    preview: valid.slice(0, PREVIEW_ROWS).map(importer.preview),
  };
}

/**
 * Checks (dryRun) or imports a CSV parsed in memory. Every row is validated first; an import with
 * errors is rejected unless skipInvalidRows is set. The write is a single transaction: either all
 * valid rows are saved or none. New logins get temporary passwords, returned once.
 */
async function runImport(ctx, type, { csv, dryRun, academicYearId, skipInvalidRows }, meta) {
  const importer = importerFor(type);
  const { records } = parseCsvRecords(csv, importer.COLUMNS);
  const options = { academicYearId };

  const firstPass = await withTenant(ctx.instituteId, (tx) =>
    importer.analyze(tx, ctx, records, options),
  );
  const report = buildReport(importer, firstPass, { dryRun });
  if (dryRun) return report;

  if (report.invalidRows && !skipInvalidRows) {
    throw new AppError(
      422,
      'IMPORT_INVALID',
      'Fix the rows with errors, or choose to skip them',
      report,
    );
  }
  if (!report.validRows) {
    throw new AppError(422, 'IMPORT_INVALID', 'There are no valid rows to import', report);
  }

  // Hash temporary passwords before the write transaction (bcrypt is slow on purpose).
  const pool = await createTemporaryCredentials(
    importer.newLoginCount(
      firstPass,
      firstPass.rows.filter((row) => !row.errors.length),
    ),
  );

  return withTenant(
    ctx.instituteId,
    async (tx) => {
      // Re-check inside the write transaction in case data changed since the first pass.
      const analysis = await importer.analyze(tx, ctx, records, options);
      const valid = analysis.rows.filter((row) => !row.errors.length);
      const batch = accounts.createBatch(ctx.instituteId);
      const stats = importer.plan(batch, analysis, valid, accounts.credentialSource(pool));
      await accounts.flushBatch(tx, batch);

      await recordAudit(tx, {
        instituteId: ctx.instituteId,
        userId: ctx.userId,
        action: `import.${type}`,
        entity: 'import',
        entityId: null,
        after: {
          totalRows: analysis.rows.length,
          imported: valid.length,
          skipped: analysis.rows.length - valid.length,
          ...stats,
        },
        meta,
      });

      return {
        dryRun: false,
        type,
        academicYear: analysis.year
          ? { id: analysis.year.id, name: analysis.year.name }
          : undefined,
        totalRows: analysis.rows.length,
        imported: valid.length,
        skipped: analysis.rows.length - valid.length,
        errors: flattenIssues(analysis.rows, 'errors'),
        stats,
        credentials: batch.credentials,
      };
    },
    { maxWait: 10_000, timeout: 30_000 + records.length * 50 },
  );
}

module.exports = { runImport, template, IMPORTERS };
