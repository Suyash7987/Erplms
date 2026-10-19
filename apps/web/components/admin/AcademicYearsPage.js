'use client';

import { useState } from 'react';
import { useI18n } from '@/components/providers/I18nProvider';
import { useAuth } from '@/components/providers/AuthProvider';
import { ErrorState, LoadingState } from '@/components/ui/StateViews';
import { CheckboxField, FormField } from '@/components/ui/FormField';
import { Badge, Notice, PageHeader } from '@/components/ui/Page';
import ResponsiveTable from '@/components/ui/ResponsiveTable';
import { apiFetch } from '@/lib/api';
import { apiErrorMessage } from '@/lib/apiErrors';
import { useApiData } from '@/lib/useApiData';

const STATUS_TONE = { current: 'green', upcoming: 'brand', closed: 'slate' };
const EMPTY_FORM = { id: null, name: '', startDate: '', endDate: '', makeCurrent: false };

export default function AcademicYearsPage() {
  const { t } = useI18n();
  const { can } = useAuth();
  const years = useApiData('/academic-years?limit=100');
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState({ tone: 'success', text: null });
  const canManage = can('academics.manage');

  async function act(work, successKey) {
    setBusy(true);
    setNotice({ tone: 'success', text: null });
    try {
      await work();
      setNotice({ tone: 'success', text: t(successKey) });
      setForm(null);
      await years.reload();
    } catch (error) {
      setNotice({ tone: 'error', text: apiErrorMessage(t, error) });
    } finally {
      setBusy(false);
    }
  }

  function save(event) {
    event.preventDefault();
    const { id, makeCurrent, ...fields } = form;
    act(
      () =>
        id
          ? apiFetch(`/academic-years/${id}`, { method: 'PATCH', body: fields })
          : apiFetch('/academic-years', { method: 'POST', body: { ...fields, makeCurrent } }),
      'common.saved',
    );
  }

  const makeCurrent = (year) =>
    act(
      () => apiFetch(`/academic-years/${year.id}/make-current`, { method: 'POST' }),
      'years.madeCurrent',
    );

  const remove = (year) => {
    if (!window.confirm(t('years.confirmDelete', { name: year.name }))) return;
    act(() => apiFetch(`/academic-years/${year.id}`, { method: 'DELETE' }), 'common.deleted');
  };

  const columns = [
    { key: 'name', header: t('years.name'), primary: true },
    {
      key: 'dates',
      header: t('years.dates'),
      render: (year) => `${year.startDate} → ${year.endDate}`,
    },
    {
      key: 'status',
      header: t('years.status'),
      render: (year) => (
        <Badge tone={STATUS_TONE[year.status]}>{t(`years.statuses.${year.status}`)}</Badge>
      ),
    },
    { key: 'sectionCount', header: t('years.sections') },
  ];
  if (canManage) {
    columns.push({
      key: 'actions',
      header: t('common.actions'),
      actions: true,
      render: (year) => (
        <div className="flex flex-wrap gap-2">
          {year.status !== 'current' ? (
            <button
              type="button"
              className="btn-secondary px-3"
              disabled={busy}
              onClick={() => makeCurrent(year)}
            >
              {t('years.makeCurrent')}
            </button>
          ) : null}
          <button
            type="button"
            className="btn-secondary px-3"
            disabled={busy}
            onClick={() =>
              setForm({
                ...EMPTY_FORM,
                id: year.id,
                name: year.name,
                startDate: year.startDate,
                endDate: year.endDate,
              })
            }
          >
            {t('common.edit')}
          </button>
          {year.status !== 'current' && year.sectionCount === 0 ? (
            <button
              type="button"
              className="btn-secondary px-3 text-red-700"
              disabled={busy}
              onClick={() => remove(year)}
            >
              {t('common.delete')}
            </button>
          ) : null}
        </div>
      ),
    });
  }

  return (
    <main className="flex flex-col gap-4 px-4 py-6">
      <PageHeader
        title={t('nav.academicYears')}
        description={t('years.description')}
        actions={
          canManage && !form ? (
            <button type="button" className="btn-primary" onClick={() => setForm(EMPTY_FORM)}>
              {t('years.add')}
            </button>
          ) : null
        }
      />
      <Notice tone={notice.tone}>{notice.text}</Notice>

      {form ? (
        <form onSubmit={save} className="card flex flex-col gap-3">
          <h2 className="font-semibold">{form.id ? t('years.edit') : t('years.add')}</h2>
          <FormField
            label={t('years.name')}
            hint={t('years.nameHint')}
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
          />
          <div className="grid grid-cols-2 gap-3">
            <FormField
              type="date"
              label={t('years.startDate')}
              value={form.startDate}
              onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
              required
            />
            <FormField
              type="date"
              label={t('years.endDate')}
              value={form.endDate}
              onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
              required
            />
          </div>
          {!form.id ? (
            <CheckboxField
              label={t('years.makeCurrentNow')}
              checked={form.makeCurrent}
              onChange={(e) => setForm((f) => ({ ...f, makeCurrent: e.target.checked }))}
            />
          ) : null}
          <div className="flex gap-2">
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? t('common.saving') : t('common.save')}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setForm(null)}>
              {t('common.cancel')}
            </button>
          </div>
        </form>
      ) : null}

      {years.phase === 'loading' ? <LoadingState /> : null}
      {years.phase === 'error' ? (
        <ErrorState message={apiErrorMessage(t, years.error)} onRetry={years.reload} />
      ) : null}
      {years.data ? (
        <ResponsiveTable
          caption={t('nav.academicYears')}
          columns={columns}
          rows={years.data.data}
          emptyTitle={t('years.empty')}
        />
      ) : null}
    </main>
  );
}
