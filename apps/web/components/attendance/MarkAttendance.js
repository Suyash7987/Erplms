'use client';

import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '@/components/providers/I18nProvider';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/StateViews';
import { FormField, SelectField } from '@/components/ui/FormField';
import { Notice, PageHeader } from '@/components/ui/Page';
import { apiFetch } from '@/lib/api';
import { apiErrorMessage } from '@/lib/apiErrors';
import { useApiData } from '@/lib/useApiData';
import { STATUSES, STATUS_STYLES } from './statuses';

/**
 * One-tap attendance: everyone starts present; tap a child to mark absent (tap again to undo), or
 * pick late / half day / leave from the menu. Works on a 360px phone with one thumb.
 */
export default function MarkAttendance({ initialSectionId }) {
  const { t } = useI18n();
  const sections = useApiData('/attendance/sections');
  const [sectionId, setSectionId] = useState(initialSectionId ?? '');
  const [date, setDate] = useState('');
  const [session, setSession] = useState('');
  const [statuses, setStatuses] = useState({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState({ tone: 'success', text: null });

  useEffect(() => {
    if (!sections.data) return;
    if (!date) setDate(sections.data.date);
    if (!sectionId && sections.data.data.length) {
      const own = sections.data.data.find((s) => s.isClassTeacher) ?? sections.data.data[0];
      setSectionId(own.id);
    }
  }, [sections.data, sectionId, date]);

  const query = new URLSearchParams({
    sectionId,
    ...(date ? { date } : {}),
    ...(session ? { session } : {}),
  });
  const roster = useApiData(sectionId && date ? `/attendance/roster?${query}` : null);
  const data = roster.data;

  useEffect(() => {
    if (!data) return;
    setStatuses(Object.fromEntries(data.students.map((s) => [s.id, s.status])));
    if (!session) setSession(data.session);
  }, [data, session]);

  const counts = useMemo(() => {
    const result = Object.fromEntries(STATUSES.map((status) => [status, 0]));
    for (const status of Object.values(statuses)) result[status] += 1;
    return result;
  }, [statuses]);

  const editable = Boolean(data?.canMark);
  const setStatus = (studentId, status) =>
    setStatuses((current) => ({ ...current, [studentId]: status }));
  const toggle = (studentId) =>
    setStatus(studentId, statuses[studentId] === 'absent' ? 'present' : 'absent');

  async function save() {
    setBusy(true);
    setNotice({ tone: 'success', text: null });
    try {
      const result = await apiFetch('/attendance/roster', {
        method: 'PUT',
        body: {
          sectionId,
          date,
          session: data.session,
          records: data.students.map((s) => ({ studentId: s.id, status: statuses[s.id] })),
        },
      });
      setNotice({
        tone: 'success',
        text: result.saved.notified
          ? t('attendance.savedNotified', { count: result.saved.notified })
          : t('attendance.saved'),
      });
      roster.reload();
    } catch (error) {
      setNotice({ tone: 'error', text: apiErrorMessage(t, error) });
    } finally {
      setBusy(false);
    }
  }

  if (sections.phase === 'loading') {
    return (
      <main className="px-4 py-6">
        <LoadingState />
      </main>
    );
  }
  if (sections.phase === 'error') {
    return (
      <main className="px-4 py-6">
        <ErrorState message={apiErrorMessage(t, sections.error)} onRetry={sections.reload} />
      </main>
    );
  }
  if (!sections.data.data.length) {
    return (
      <main className="px-4 py-6">
        <EmptyState
          title={t('attendance.noSections')}
          description={t('attendance.noSectionsHelp')}
        />
      </main>
    );
  }

  return (
    <main className="flex flex-col gap-4 px-4 pb-28 pt-6">
      <PageHeader title={t('attendance.markTitle')} />

      <section className="card grid gap-3 sm:grid-cols-3">
        <SelectField
          label={t('attendance.section')}
          value={sectionId}
          onChange={(e) => {
            setSectionId(e.target.value);
            setNotice({ tone: 'success', text: null });
          }}
          options={sections.data.data.map((s) => ({
            value: s.id,
            label: `${s.label}${s.markedToday.length ? ' ✓' : ''}`,
          }))}
        />
        <FormField
          type="date"
          label={t('attendance.date')}
          value={date}
          max={sections.data.date}
          onChange={(e) => {
            setDate(e.target.value);
            setNotice({ tone: 'success', text: null });
          }}
        />
        {data?.sessionTypes.length > 1 ? (
          <SelectField
            label={t('attendance.session')}
            value={session}
            onChange={(e) => setSession(e.target.value)}
            options={data.sessionTypes.map((type) => ({
              value: type,
              label: t(`attendance.sessions.${type}`),
            }))}
          />
        ) : null}
      </section>

      <Notice tone={notice.tone}>{notice.text}</Notice>
      {roster.phase === 'loading' ? <LoadingState /> : null}
      {roster.phase === 'error' ? (
        <ErrorState message={apiErrorMessage(t, roster.error)} onRetry={roster.reload} />
      ) : null}

      {data ? (
        <>
          <p className="text-sm text-slate-600" aria-live="polite">
            {data.marked
              ? t('attendance.markedBy', {
                  name: data.markedBy ?? '—',
                  time: new Date(data.markedAt).toLocaleTimeString('en-IN', {
                    hour: 'numeric',
                    minute: '2-digit',
                  }),
                })
              : t('attendance.notMarked')}
            {data.canMark ? ` ${t('attendance.editableUntil', { date: data.editableUntil })}` : ''}
          </p>
          {data.lockedReason ? (
            <Notice tone="error">{t(`attendance.locked.${data.lockedReason}`)}</Notice>
          ) : null}

          {data.students.length ? (
            <>
              {editable ? (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-slate-600">{t('attendance.tapHint')}</p>
                  <button
                    type="button"
                    className="btn-secondary px-3"
                    onClick={() =>
                      setStatuses(
                        Object.fromEntries(
                          data.students.map((s) => [s.id, s.onLeave ? 'on_leave' : 'present']),
                        ),
                      )
                    }
                  >
                    {t('attendance.allPresent')}
                  </button>
                </div>
              ) : null}
              <ul className="flex flex-col gap-2">
                {data.students.map((student) => {
                  const status = statuses[student.id] ?? student.status;
                  return (
                    <li key={student.id} className="flex items-stretch gap-2">
                      <button
                        type="button"
                        disabled={!editable}
                        onClick={() => toggle(student.id)}
                        aria-pressed={status === 'absent'}
                        className={`flex min-h-14 flex-1 items-center gap-3 rounded-2xl px-3 text-left ring-1 transition-colors ${STATUS_STYLES[status]}`}
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/70 text-sm font-semibold">
                          {student.rollNo ?? '–'}
                        </span>
                        <span className="flex-1">
                          <span className="block font-medium">{student.name}</span>
                          <span className="block text-xs">
                            {t(`attendance.statuses.${status}`)}
                            {student.onLeave ? ` · ${t('attendance.approvedLeave')}` : ''}
                          </span>
                        </span>
                      </button>
                      <label className="sr-only" htmlFor={`status-${student.id}`}>
                        {t('attendance.statusFor', { name: student.name })}
                      </label>
                      <select
                        id={`status-${student.id}`}
                        disabled={!editable}
                        value={status}
                        onChange={(e) => setStatus(student.id, e.target.value)}
                        className="w-20 rounded-2xl border border-slate-300 bg-white px-1 text-sm"
                      >
                        {STATUSES.map((option) => (
                          <option key={option} value={option}>
                            {t(`attendance.short.${option}`)}
                          </option>
                        ))}
                      </select>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <EmptyState title={t('attendance.noStudents')} />
          )}

          {editable && data.students.length ? (
            <div className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
              <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-3">
                <p className="text-sm" aria-live="polite">
                  <span className="font-semibold text-emerald-700">
                    {t('attendance.short.present')} {counts.present}
                  </span>
                  {' · '}
                  <span className="font-semibold text-red-700">
                    {t('attendance.short.absent')} {counts.absent}
                  </span>
                  {counts.late || counts.half_day || counts.on_leave
                    ? ` · ${t('attendance.others', { count: counts.late + counts.half_day + counts.on_leave })}`
                    : ''}
                </p>
                <button type="button" className="btn-primary" disabled={busy} onClick={save}>
                  {busy
                    ? t('common.saving')
                    : data.marked
                      ? t('attendance.update')
                      : t('attendance.save')}
                </button>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </main>
  );
}
