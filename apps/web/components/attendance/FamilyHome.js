'use client';

import Link from 'next/link';
import { useI18n } from '@/components/providers/I18nProvider';
import { useAuth } from '@/components/providers/AuthProvider';
import { ErrorState, LoadingState } from '@/components/ui/StateViews';
import { apiErrorMessage } from '@/lib/apiErrors';
import { useApiData } from '@/lib/useApiData';

/** Parent / student home: the child in focus and this month's attendance at a glance. */
export default function FamilyHome({ area }) {
  const { t } = useI18n();
  const { session, can } = useAuth();
  const attendanceOn =
    session.institute.enabledModules?.attendance === true && can('attendance.view_own');
  const attendance = useApiData(attendanceOn ? '/attendance/me' : null);
  const profile = session.activeProfile;

  return (
    <main className="flex flex-col gap-4 px-4 py-6">
      <h1 className="text-xl font-semibold">{t('shell.welcome', { name: session.user.name })}</h1>
      <section className="card flex flex-col gap-1 bg-brand-50">
        <p className="text-lg font-semibold text-brand-700">{profile.label}</p>
        {profile.detail ? <p className="text-sm text-slate-700">{profile.detail}</p> : null}
      </section>

      {attendanceOn ? (
        <Link href={`${area}/attendance`} className="card flex flex-col gap-2 hover:bg-slate-50">
          <span className="font-semibold">{t('nav.attendance')}</span>
          {attendance.phase === 'loading' ? <LoadingState /> : null}
          {attendance.phase === 'error' ? (
            <ErrorState message={apiErrorMessage(t, attendance.error)} />
          ) : null}
          {attendance.data ? (
            <span className="text-sm text-slate-700">
              {t('attendance.homeSummary', {
                present: attendance.data.summary.present + attendance.data.summary.late,
                absent: attendance.data.summary.absent,
                percentage: attendance.data.yearSummary.percentage ?? '—',
              })}
            </span>
          ) : null}
        </Link>
      ) : null}
      <section className="card text-sm text-slate-600">{t('shell.dashboardSoon')}</section>
    </main>
  );
}
