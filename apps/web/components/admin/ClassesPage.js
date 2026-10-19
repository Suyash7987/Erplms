'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useI18n } from '@/components/providers/I18nProvider';
import { useAuth } from '@/components/providers/AuthProvider';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/StateViews';
import { FormField, SelectField } from '@/components/ui/FormField';
import { Badge, Notice, PageHeader } from '@/components/ui/Page';
import { apiFetch } from '@/lib/api';
import { apiErrorMessage } from '@/lib/apiErrors';
import { useApiData } from '@/lib/useApiData';
import { useLabels } from '@/lib/useLabels';

const BANDS = ['primary', 'middle', 'secondary', 'senior'];

export default function ClassesPage() {
  const { t } = useI18n();
  const { can } = useAuth();
  const labels = useLabels();
  const canManage = can('academics.manage');

  const years = useApiData('/academic-years?limit=100');
  const levels = useApiData('/levels?limit=100&includeInactive=true');
  const [yearId, setYearId] = useState('');
  const sections = useApiData(yearId ? `/sections?limit=100&academicYearId=${yearId}` : null);

  const [newLevel, setNewLevel] = useState({ name: '', band: '' });
  const [sectionDrafts, setSectionDrafts] = useState({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState({ tone: 'success', text: null });

  useEffect(() => {
    if (!yearId && years.data) {
      const current =
        years.data.data.find((year) => year.status === 'current') ?? years.data.data[0];
      if (current) setYearId(current.id);
    }
  }, [years.data, yearId]);

  const sectionsByLevel = useMemo(() => {
    const grouped = {};
    for (const section of sections.data?.data ?? []) {
      (grouped[section.level.id] ??= []).push(section);
    }
    return grouped;
  }, [sections.data]);

  async function act(work, successText) {
    setBusy(true);
    setNotice({ tone: 'success', text: null });
    try {
      await work();
      setNotice({ tone: 'success', text: successText });
      await Promise.all([levels.reload(), sections.reload()]);
      return true;
    } catch (error) {
      setNotice({ tone: 'error', text: apiErrorMessage(t, error) });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function addLevel(event) {
    event.preventDefault();
    const ok = await act(
      () =>
        apiFetch('/levels', {
          method: 'POST',
          body: { name: newLevel.name, band: newLevel.band || null },
        }),
      t('common.saved'),
    );
    if (ok) setNewLevel({ name: '', band: '' });
  }

  const createStandardLevels = () =>
    act(
      () =>
        apiFetch('/levels/range', {
          method: 'POST',
          body: { from: 1, to: 12, prefix: labels.level },
        }),
      t('common.saved'),
    );

  async function addSection(level) {
    const name = (sectionDrafts[level.id] ?? '').trim();
    if (!name) return;
    const ok = await act(
      () =>
        apiFetch('/sections', {
          method: 'POST',
          body: { academicYearId: yearId, levelId: level.id, name },
        }),
      t('common.saved'),
    );
    if (ok) setSectionDrafts((drafts) => ({ ...drafts, [level.id]: '' }));
  }

  const toggleLevel = (level) =>
    act(
      () =>
        apiFetch(`/levels/${level.id}`, { method: 'PATCH', body: { isActive: !level.isActive } }),
      t('common.saved'),
    );

  const deleteLevel = (level) => {
    if (!window.confirm(t('classes.confirmDeleteLevel', { name: level.name }))) return;
    act(() => apiFetch(`/levels/${level.id}`, { method: 'DELETE' }), t('common.deleted'));
  };

  const loading = years.phase === 'loading' || levels.phase === 'loading';
  const failed = years.error ?? levels.error ?? sections.error;
  const levelList = levels.data?.data ?? [];
  const yearOptions = (years.data?.data ?? []).map((year) => ({
    value: year.id,
    label: `${year.name}${year.status === 'current' ? ` (${t('years.statuses.current')})` : ''}`,
  }));

  return (
    <main className="flex flex-col gap-4 px-4 py-6">
      <PageHeader
        title={t('classes.title', { level: labels.level, section: labels.section })}
        description={t('classes.description', { level: labels.level, section: labels.section })}
      />
      <Notice tone={notice.tone}>{notice.text}</Notice>

      {loading ? <LoadingState /> : null}
      {failed ? (
        <ErrorState
          message={apiErrorMessage(t, failed)}
          onRetry={() => Promise.all([years.reload(), levels.reload(), sections.reload()])}
        />
      ) : null}

      {!loading && !yearOptions.length ? (
        <EmptyState
          title={t('classes.noYear')}
          action={
            <Link href="/admin/academic-years" className="btn-primary">
              {t('years.add')}
            </Link>
          }
        />
      ) : null}

      {yearOptions.length ? (
        <SelectField
          label={t('classes.yearPicker')}
          value={yearId}
          onChange={(event) => setYearId(event.target.value)}
          options={yearOptions}
        />
      ) : null}

      {canManage ? (
        <form
          onSubmit={addLevel}
          className="card grid grid-cols-1 items-end gap-3 sm:grid-cols-[1fr,10rem,auto]"
        >
          <FormField
            label={t('classes.newLevel', { level: labels.level })}
            placeholder={`${labels.level} 1`}
            value={newLevel.name}
            onChange={(e) => setNewLevel((l) => ({ ...l, name: e.target.value }))}
            required
          />
          <SelectField
            label={t('classes.band')}
            value={newLevel.band}
            onChange={(e) => setNewLevel((l) => ({ ...l, band: e.target.value }))}
            placeholder={t('classes.noBand')}
            options={BANDS.map((band) => ({ value: band, label: t(`classes.bands.${band}`) }))}
          />
          <button type="submit" className="btn-primary" disabled={busy}>
            {t('common.add')}
          </button>
        </form>
      ) : null}

      {!loading && !levelList.length ? (
        <EmptyState
          title={t('classes.noLevels', { level: labels.level })}
          action={
            canManage ? (
              <button
                type="button"
                className="btn-primary"
                disabled={busy}
                onClick={createStandardLevels}
              >
                {t('setup.createLevels', { level: labels.level, from: 1, to: 12 })}
              </button>
            ) : null
          }
        />
      ) : null}

      {sections.phase === 'loading' && yearId ? <LoadingState /> : null}

      <ul className="flex flex-col gap-3">
        {levelList.map((level) => {
          const levelSections = sectionsByLevel[level.id] ?? [];
          return (
            <li key={level.id} className="card flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-semibold">{level.name}</h2>
                  {level.band ? (
                    <Badge tone="brand">{t(`classes.bands.${level.band}`)}</Badge>
                  ) : null}
                  {!level.isActive ? <Badge>{t('common.inactive')}</Badge> : null}
                </div>
                {canManage ? (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="btn-secondary px-3"
                      disabled={busy}
                      onClick={() => toggleLevel(level)}
                    >
                      {level.isActive ? t('common.deactivate') : t('common.activate')}
                    </button>
                    {level.sectionCount === 0 ? (
                      <button
                        type="button"
                        className="btn-secondary px-3 text-red-700"
                        disabled={busy}
                        onClick={() => deleteLevel(level)}
                      >
                        {t('common.delete')}
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>

              {levelSections.length ? (
                <ul className="grid gap-2 sm:grid-cols-2">
                  {levelSections.map((section) => (
                    <li key={section.id}>
                      <Link
                        href={`/admin/classes/${section.id}`}
                        className="flex min-h-14 flex-col justify-center rounded-xl border border-slate-200 px-3 py-2 hover:bg-slate-50"
                      >
                        <span className="font-medium text-slate-900">
                          {labels.section} {section.name}
                          {!section.isActive ? ` · ${t('common.inactive')}` : ''}
                        </span>
                        <span className="text-xs text-slate-600">
                          {t('classes.sectionSummary', {
                            students: section.studentCount,
                            subjects: section.subjectCount,
                          })}
                          {section.classTeacher ? ` · ${section.classTeacher.name}` : ''}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-500">
                  {t('classes.noSections', { section: labels.section })}
                </p>
              )}

              {canManage && yearId && level.isActive ? (
                <div className="flex items-end gap-2">
                  <div className="w-32">
                    <FormField
                      label={t('classes.newSection', { section: labels.section })}
                      placeholder="A"
                      value={sectionDrafts[level.id] ?? ''}
                      onChange={(e) =>
                        setSectionDrafts((drafts) => ({ ...drafts, [level.id]: e.target.value }))
                      }
                    />
                  </div>
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={busy}
                    onClick={() => addSection(level)}
                  >
                    {t('common.add')}
                  </button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </main>
  );
}
