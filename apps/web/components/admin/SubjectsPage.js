'use client';

import { useState } from 'react';
import { useI18n } from '@/components/providers/I18nProvider';
import { useAuth } from '@/components/providers/AuthProvider';
import { ErrorState, LoadingState } from '@/components/ui/StateViews';
import { FormField } from '@/components/ui/FormField';
import { Badge, Notice, PageHeader } from '@/components/ui/Page';
import ResponsiveTable from '@/components/ui/ResponsiveTable';
import { apiFetch } from '@/lib/api';
import { apiErrorMessage } from '@/lib/apiErrors';
import { useApiData } from '@/lib/useApiData';

export default function SubjectsPage() {
  const { t } = useI18n();
  const { can } = useAuth();
  const canManage = can('academics.manage');
  const subjects = useApiData('/subjects?limit=100&includeInactive=true');
  const [draft, setDraft] = useState({ name: '', code: '' });
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState({ tone: 'success', text: null });

  async function act(work, successKey) {
    setBusy(true);
    setNotice({ tone: 'success', text: null });
    try {
      const result = await work();
      setNotice({ tone: 'success', text: t(successKey) });
      await subjects.reload();
      return result ?? true;
    } catch (error) {
      setNotice({ tone: 'error', text: apiErrorMessage(t, error) });
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function add(event) {
    event.preventDefault();
    const result = await act(
      () => apiFetch('/subjects', { method: 'POST', body: draft }),
      'common.saved',
    );
    if (result?.skipped) setNotice({ tone: 'error', text: t('subjects.codeExists') });
    else if (result) setDraft({ name: '', code: '' });
  }

  async function saveEdit(event) {
    event.preventDefault();
    const ok = await act(
      () =>
        apiFetch(`/subjects/${editing.id}`, {
          method: 'PATCH',
          body: { name: editing.name, code: editing.code },
        }),
      'common.saved',
    );
    if (ok) setEditing(null);
  }

  const toggle = (subject) =>
    act(
      () =>
        apiFetch(`/subjects/${subject.id}`, {
          method: 'PATCH',
          body: { isActive: !subject.isActive },
        }),
      'common.saved',
    );

  const remove = (subject) => {
    if (!window.confirm(t('subjects.confirmDelete', { name: subject.name }))) return;
    act(() => apiFetch(`/subjects/${subject.id}`, { method: 'DELETE' }), 'common.deleted');
  };

  const columns = [
    { key: 'name', header: t('subjects.name'), primary: true },
    { key: 'code', header: t('subjects.code') },
    { key: 'sectionCount', header: t('subjects.usedIn') },
    {
      key: 'status',
      header: t('years.status'),
      render: (subject) =>
        subject.isActive ? (
          <Badge tone="green">{t('common.active')}</Badge>
        ) : (
          <Badge>{t('common.inactive')}</Badge>
        ),
    },
  ];
  if (canManage) {
    columns.push({
      key: 'actions',
      header: t('common.actions'),
      actions: true,
      render: (subject) => (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-secondary px-3"
            disabled={busy}
            onClick={() => setEditing({ id: subject.id, name: subject.name, code: subject.code })}
          >
            {t('common.edit')}
          </button>
          <button
            type="button"
            className="btn-secondary px-3"
            disabled={busy}
            onClick={() => toggle(subject)}
          >
            {subject.isActive ? t('common.deactivate') : t('common.activate')}
          </button>
          {subject.sectionCount === 0 ? (
            <button
              type="button"
              className="btn-secondary px-3 text-red-700"
              disabled={busy}
              onClick={() => remove(subject)}
            >
              {t('common.delete')}
            </button>
          ) : null}
        </div>
      ),
    });
  }

  const subjectForm = (values, setValues, onSubmit, title, submitLabel, onCancel) => (
    <form
      onSubmit={onSubmit}
      className="card grid grid-cols-1 items-end gap-3 sm:grid-cols-[1fr,9rem,auto]"
    >
      <h2 className="font-semibold sm:col-span-3">{title}</h2>
      <FormField
        label={t('subjects.name')}
        value={values.name}
        onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
        required
      />
      <FormField
        label={t('subjects.code')}
        hint={t('subjects.codeHint')}
        value={values.code}
        onChange={(e) => setValues((v) => ({ ...v, code: e.target.value.toUpperCase() }))}
        required
      />
      <div className="flex gap-2">
        <button type="submit" className="btn-primary" disabled={busy}>
          {submitLabel}
        </button>
        {onCancel ? (
          <button type="button" className="btn-secondary" onClick={onCancel}>
            {t('common.cancel')}
          </button>
        ) : null}
      </div>
    </form>
  );

  return (
    <main className="flex flex-col gap-4 px-4 py-6">
      <PageHeader title={t('nav.subjects')} description={t('subjects.description')} />
      <Notice tone={notice.tone}>{notice.text}</Notice>

      {canManage && editing
        ? subjectForm(editing, setEditing, saveEdit, t('subjects.edit'), t('common.save'), () =>
            setEditing(null),
          )
        : null}
      {canManage && !editing
        ? subjectForm(draft, setDraft, add, t('subjects.add'), t('common.add'))
        : null}

      {subjects.phase === 'loading' ? <LoadingState /> : null}
      {subjects.phase === 'error' ? (
        <ErrorState message={apiErrorMessage(t, subjects.error)} onRetry={subjects.reload} />
      ) : null}
      {subjects.data ? (
        <ResponsiveTable
          caption={t('nav.subjects')}
          columns={columns}
          rows={subjects.data.data}
          emptyTitle={t('subjects.empty')}
        />
      ) : null}
    </main>
  );
}
