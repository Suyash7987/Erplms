'use client';

import { useState } from 'react';
import { useI18n } from '@/components/providers/I18nProvider';
import { ErrorState, LoadingState } from '@/components/ui/StateViews';
import { PageHeader } from '@/components/ui/Page';
import { apiErrorMessage } from '@/lib/apiErrors';
import { useApiData } from '@/lib/useApiData';
import { STATUSES, STATUS_STYLES } from './statuses';

const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function shiftMonth(month, delta) {
  const [year, monthNo] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, monthNo - 1 + delta, 1));
  return date.toISOString().slice(0, 7);
}

/** Calendar cells for a month, Monday first, padded with blanks. */
function calendarCells(month) {
  const [year, monthNo] = month.split('-').map(Number);
  const first = new Date(Date.UTC(year, monthNo - 1, 1));
  const days = new Date(Date.UTC(year, monthNo, 0)).getUTCDate();
  const offset = (first.getUTCDay() + 6) % 7;
  return [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: days }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`),
  ];
}

/** A parent's (or student's) month at a glance: a colour calendar and simple totals. */
export default function MyAttendance() {
  const { t, locale } = useI18n();
  const [month, setMonth] = useState('');
  const report = useApiData(`/attendance/me${month ? `?month=${month}` : ''}`);
  const data = report.data;

  if (report.phase === 'loading') {
    return (
      <main className="px-4 py-6">
        <LoadingState />
      </main>
    );
  }
  if (report.phase === 'error') {
    return (
      <main className="px-4 py-6">
        <ErrorState message={apiErrorMessage(t, report.error)} onRetry={report.reload} />
      </main>
    );
  }

  const byDate = new Map();
  for (const day of data.days) byDate.set(day.date, [...(byDate.get(day.date) ?? []), day]);
  const monthName = new Date(`${data.month}-01T00:00:00Z`).toLocaleDateString(
    locale === 'hi' ? 'hi-IN' : 'en-IN',
    {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    },
  );
  const absences = data.days.filter((d) => d.status === 'absent');

  return (
    <main className="flex flex-col gap-4 px-4 py-6">
      <PageHeader title={t('attendance.myTitle', { name: data.student.name })} />

      <section className="grid grid-cols-3 gap-3">
        <div className="card flex flex-col items-center gap-1 bg-emerald-50 p-3">
          <span className="text-2xl font-bold text-emerald-700">
            {data.summary.present + data.summary.late}
          </span>
          <span className="text-xs text-emerald-900">{t('attendance.daysPresent')}</span>
        </div>
        <div className="card flex flex-col items-center gap-1 bg-red-50 p-3">
          <span className="text-2xl font-bold text-red-700">{data.summary.absent}</span>
          <span className="text-xs text-red-900">{t('attendance.daysAbsent')}</span>
        </div>
        <div className="card flex flex-col items-center gap-1 bg-brand-50 p-3">
          <span className="text-2xl font-bold text-brand-700">
            {data.yearSummary.percentage === null ? '—' : `${data.yearSummary.percentage}%`}
          </span>
          <span className="text-center text-xs text-brand-700">{t('attendance.thisYear')}</span>
        </div>
      </section>

      <section className="card flex flex-col gap-3" aria-labelledby="month-title">
        <div className="flex items-center justify-between">
          <button
            type="button"
            className="btn-secondary px-3"
            onClick={() => setMonth(shiftMonth(data.month, -1))}
            aria-label={t('attendance.previousMonth')}
          >
            ‹
          </button>
          <h2 id="month-title" className="font-semibold">
            {monthName}
          </h2>
          <button
            type="button"
            className="btn-secondary px-3"
            onClick={() => setMonth(shiftMonth(data.month, 1))}
            aria-label={t('attendance.nextMonth')}
          >
            ›
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-xs">
          {WEEKDAYS.map((day) => (
            <span key={day} className="font-medium text-slate-500">
              {t(`attendance.weekdays.${day}`)}
            </span>
          ))}
          {calendarCells(data.month).map((date, index) => {
            if (!date) return <span key={`blank-${index}`} />;
            const marks = byDate.get(date) ?? [];
            const status = marks.find((m) => m.status === 'absent')?.status ?? marks[0]?.status;
            return (
              <span
                key={date}
                className={`flex aspect-square flex-col items-center justify-center rounded-lg text-sm ${
                  status ? `${STATUS_STYLES[status]} ring-1` : 'text-slate-400'
                }`}
                title={
                  marks.map((m) => t(`attendance.statuses.${m.status}`)).join(', ') || undefined
                }
              >
                {Number(date.slice(8))}
                {marks.length > 1 ? (
                  <span className="text-[10px]">
                    {marks.map((m) => m.status[0].toUpperCase()).join('')}
                  </span>
                ) : null}
              </span>
            );
          })}
        </div>
        <ul className="flex flex-wrap gap-2 text-xs">
          {STATUSES.map((status) => (
            <li key={status} className={`rounded-full px-2 py-0.5 ring-1 ${STATUS_STYLES[status]}`}>
              {t(`attendance.statuses.${status}`)}
            </li>
          ))}
        </ul>
      </section>

      {absences.length ? (
        <section className="card flex flex-col gap-2">
          <h2 className="font-semibold">{t('attendance.absencesThisMonth')}</h2>
          <ul className="text-sm">
            {absences.map((absence) => (
              <li key={`${absence.date}-${absence.session}`}>
                {new Date(`${absence.date}T00:00:00Z`).toLocaleDateString(
                  locale === 'hi' ? 'hi-IN' : 'en-IN',
                  {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                    timeZone: 'UTC',
                  },
                )}
                {absence.session !== 'full_day'
                  ? ` · ${t(`attendance.sessions.${absence.session}`)}`
                  : ''}
                {absence.remark ? ` · ${absence.remark}` : ''}
              </li>
            ))}
          </ul>
          <p className="text-xs text-slate-500">{t('attendance.contactSchool')}</p>
        </section>
      ) : (
        <p className="text-sm text-slate-600">{t('attendance.noAbsences')}</p>
      )}
    </main>
  );
}
