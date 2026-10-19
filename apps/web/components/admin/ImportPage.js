'use client';

import { useState } from 'react';
import { useI18n } from '@/components/providers/I18nProvider';
import { useAuth } from '@/components/providers/AuthProvider';
import { CheckboxField, SelectField } from '@/components/ui/FormField';
import { Notice, PageHeader } from '@/components/ui/Page';
import ResponsiveTable from '@/components/ui/ResponsiveTable';
import CredentialsNotice from '@/components/admin/CredentialsNotice';
import { apiFetch, ApiError } from '@/lib/api';
import { apiErrorMessage } from '@/lib/apiErrors';
import { downloadCsv, saveBlob } from '@/lib/csv';

const TYPES = [
  { type: 'students', permission: 'students.import' },
  { type: 'staff', permission: 'staff.import' },
];

// Matches the API limit; larger files should be split.
const MAX_FILE_BYTES = 1_000_000;

const PREVIEW_COLUMNS = {
  students: [
    ['row', (r) => r.row],
    ['admissionNo', (r) => r.admissionNo],
    ['name', (r) => r.name],
    ['section', (r) => r.section],
    ['rollNo', (r) => r.rollNo ?? '—'],
    ['guardians', (r) => r.guardians.join(', ')],
  ],
  staff: [
    ['row', (r) => r.row],
    ['employeeCode', (r) => r.employeeCode],
    ['name', (r) => r.name],
    ['phone', (r) => r.phone],
    ['roles', (r) => r.roles.join(', ')],
  ],
};

function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file, 'utf-8');
  });
}

export default function ImportPage({ initialType }) {
  const { t } = useI18n();
  const { can } = useAuth();
  const allowed = TYPES.filter((entry) => can(entry.permission));
  const [type, setType] = useState(
    allowed.some((entry) => entry.type === initialType) ? initialType : allowed[0]?.type,
  );
  const [file, setFile] = useState(null);
  const [report, setReport] = useState(null);
  const [result, setResult] = useState(null);
  const [skipInvalid, setSkipInvalid] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const reset = () => {
    setFile(null);
    setReport(null);
    setResult(null);
    setSkipInvalid(false);
    setError(null);
  };

  async function downloadTemplate() {
    setError(null);
    try {
      const blob = await apiFetch(`/imports/${type}/template`, { responseType: 'blob' });
      saveBlob(blob, `${type}-import-template.csv`);
    } catch (failure) {
      setError(apiErrorMessage(t, failure));
    }
  }

  async function chooseFile(event) {
    const chosen = event.target.files?.[0];
    event.target.value = '';
    if (!chosen) return;
    reset();
    if (chosen.size > MAX_FILE_BYTES) {
      setError(t('imports.tooLarge'));
      return;
    }
    try {
      setFile({ name: chosen.name, text: await readFile(chosen) });
    } catch {
      setError(t('imports.unreadable'));
    }
  }

  async function send(dryRun) {
    setBusy(true);
    setError(null);
    try {
      const response = await apiFetch(`/imports/${type}`, {
        method: 'POST',
        body: { csv: file.text, dryRun, skipInvalidRows: skipInvalid },
        timeoutMs: 90_000,
      });
      if (dryRun) setReport(response);
      else setResult(response);
    } catch (failure) {
      if (failure instanceof ApiError && failure.code === 'IMPORT_INVALID') {
        setReport(failure.details);
        setError(failure.message);
      } else if (failure instanceof ApiError && failure.details?.missingColumns) {
        const { missingColumns, unknownColumns } = failure.details;
        setError(
          [
            failure.message,
            missingColumns.length
              ? t('imports.missingColumns', { columns: missingColumns.join(', ') })
              : '',
            unknownColumns.length
              ? t('imports.unknownColumns', { columns: unknownColumns.join(', ') })
              : '',
          ]
            .filter(Boolean)
            .join(' '),
        );
      } else {
        setError(apiErrorMessage(t, failure));
      }
    } finally {
      setBusy(false);
    }
  }

  const downloadErrors = () =>
    downloadCsv(
      [['row', 'column', 'message'], ...report.errors.map((e) => [e.row, e.column, e.message])],
      `${type}-import-errors.csv`,
    );

  if (!type) {
    return (
      <main className="px-4 py-6">
        <p role="alert" className="alert-error">
          {t('errors.forbidden')}
        </p>
      </main>
    );
  }

  if (result) {
    return (
      <main className="flex flex-col gap-4 px-4 py-6">
        <PageHeader title={t('imports.doneTitle')} />
        <Notice>{t('imports.done', { imported: result.imported, skipped: result.skipped })}</Notice>
        <CredentialsNotice credentials={result.credentials} filename={`${type}-logins.csv`} />
        <button type="button" className="btn-secondary self-start" onClick={reset}>
          {t('imports.another')}
        </button>
      </main>
    );
  }

  const canImport =
    report && report.validRows > 0 && (report.invalidRows === 0 || skipInvalid) && !busy;

  return (
    <main className="flex flex-col gap-4 px-4 py-6">
      <PageHeader title={t('nav.import')} description={t('imports.description')} />

      <section className="card flex flex-col gap-3">
        {allowed.length > 1 ? (
          <SelectField
            label={t('imports.type')}
            value={type}
            onChange={(event) => {
              setType(event.target.value);
              reset();
            }}
            options={allowed.map((entry) => ({
              value: entry.type,
              label: t(`imports.types.${entry.type}`),
            }))}
          />
        ) : null}
        <ol className="list-inside list-decimal text-sm text-slate-700">
          <li>{t('imports.step1')}</li>
          <li>{t('imports.step2')}</li>
          <li>{t('imports.step3')}</li>
        </ol>
        <p className="text-sm text-slate-600">{t('imports.excelHint')}</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary" onClick={downloadTemplate}>
            {t('imports.template')}
          </button>
          <label className="btn-secondary cursor-pointer">
            {t('imports.chooseFile')}
            <input type="file" accept=".csv,text/csv" className="sr-only" onChange={chooseFile} />
          </label>
        </div>
        {file ? (
          <p className="text-sm text-slate-700">{t('imports.selected', { name: file.name })}</p>
        ) : null}
        <Notice tone="error">{error}</Notice>
        {file && !report ? (
          <button
            type="button"
            className="btn-primary self-start"
            disabled={busy}
            onClick={() => send(true)}
          >
            {busy ? t('imports.checking') : t('imports.check')}
          </button>
        ) : null}
      </section>

      {report ? (
        <>
          <section className="grid grid-cols-3 gap-3">
            {[
              ['total', report.totalRows],
              ['valid', report.validRows],
              ['invalid', report.invalidRows],
            ].map(([key, value]) => (
              <div key={key} className="card flex flex-col p-3">
                <span className="text-xs font-medium text-slate-500">
                  {t(`imports.counts.${key}`)}
                </span>
                <span
                  className={`text-lg font-semibold ${key === 'invalid' && value ? 'text-red-700' : ''}`}
                >
                  {value}
                </span>
              </div>
            ))}
          </section>

          <section className="card flex flex-col gap-2">
            <h2 className="font-semibold">{t('imports.willCreate')}</h2>
            <ul className="grid gap-1 text-sm sm:grid-cols-2">
              {Object.entries(report.summary).map(([key, value]) => (
                <li key={key}>
                  {t(`imports.summary.${key}`)}: <strong>{value}</strong>
                </li>
              ))}
            </ul>
            {report.academicYear ? (
              <p className="text-sm text-slate-600">
                {t('imports.intoYear', { year: report.academicYear.name })}
              </p>
            ) : null}
          </section>

          {report.errors.length ? (
            <section className="card flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-semibold text-red-800">{t('imports.errorsTitle')}</h2>
                <button type="button" className="btn-secondary px-3" onClick={downloadErrors}>
                  {t('imports.downloadErrors')}
                </button>
              </div>
              <ResponsiveTable
                caption={t('imports.errorsTitle')}
                rowKey="key"
                rows={report.errors.map((e, i) => ({ ...e, key: `${e.row}-${e.column}-${i}` }))}
                columns={[
                  {
                    key: 'row',
                    header: t('imports.row'),
                    primary: true,
                    render: (e) => t('imports.rowN', { row: e.row }),
                  },
                  { key: 'column', header: t('imports.column') },
                  { key: 'message', header: t('imports.problem') },
                ]}
              />
            </section>
          ) : null}

          {report.warnings.length ? (
            <section className="card flex flex-col gap-2">
              <h2 className="font-semibold text-amber-800">{t('imports.warningsTitle')}</h2>
              <ul className="text-sm">
                {report.warnings.map((w, i) => (
                  <li key={`${w.row}-${i}`}>
                    {t('imports.rowN', { row: w.row })} · {w.column}: {w.message}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {report.preview.length ? (
            <section className="card flex flex-col gap-3">
              <h2 className="font-semibold">
                {t('imports.previewTitle', { count: report.preview.length })}
              </h2>
              <ResponsiveTable
                caption={t('imports.previewTitle', { count: report.preview.length })}
                rowKey="row"
                rows={report.preview}
                columns={PREVIEW_COLUMNS[type].map(([key, render], index) => ({
                  key,
                  header: t(`imports.preview.${key}`),
                  render,
                  primary: index === 2,
                }))}
              />
            </section>
          ) : null}

          <section className="card flex flex-col gap-3">
            {report.invalidRows ? (
              <CheckboxField
                label={t('imports.skipInvalid', { count: report.invalidRows })}
                checked={skipInvalid}
                onChange={(event) => setSkipInvalid(event.target.checked)}
              />
            ) : null}
            <p className="text-sm text-slate-600">{t('imports.allOrNothing')}</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-primary"
                disabled={!canImport}
                onClick={() => send(false)}
              >
                {busy
                  ? t('imports.importing')
                  : t('imports.importRows', { count: report.validRows })}
              </button>
              <button type="button" className="btn-secondary" onClick={reset} disabled={busy}>
                {t('imports.chooseAnother')}
              </button>
            </div>
          </section>
        </>
      ) : null}
    </main>
  );
}
