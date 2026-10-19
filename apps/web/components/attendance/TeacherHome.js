'use client';

import Link from 'next/link';
import { useI18n } from '@/components/providers/I18nProvider';
import { useAuth } from '@/components/providers/AuthProvider';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/StateViews';
import { Badge } from '@/components/ui/Page';
import { apiErrorMessage } from '@/lib/apiErrors';
import { useApiData } from '@/lib/useApiData';

/** Teacher home: today's sections with one tap into marking attendance. */
export default function TeacherHome() {
  const { t } = useI18n();
  const { session, can } = useAuth();
  const attendanceOn = session.institute.enabledModules?.attendance === true;
  const sections = useApiData(
    attendanceOn && can('attendance.mark') ? '/attendance/sections' : null,
  );

  return (
    <main className="flex flex-col gap-4 px-4 py-6">
      <h1 className="text-xl font-semibold">{t('shell.welcome', { name: session.user.name })}</h1>
      {attendanceOn && can('attendance.mark') ? (
        <section className="card flex flex-col gap-3">
          <h2 className="font-semibold">{t('attendance.todayTitle')}</h2>
          {sections.phase === 'loading' ? <LoadingState /> : null}
          {sections.phase === 'error' ? (
            <ErrorState message={apiErrorMessage(t, sections.error)} onRetry={sections.reload} />
          ) : null}
          {sections.data && !sections.data.data.length ? (
            <EmptyState
              title={t('attendance.noSections')}
              description={t('attendance.noSectionsHelp')}
            />
          ) : null}
          <ul className="flex flex-col gap-2">
            {(sections.data?.data ?? []).map((section) => (
              <li key={section.id}>
                <Link
                  href={`/teacher/attendance?sectionId=${section.id}`}
                  className="flex min-h-14 items-center justify-between gap-3 rounded-2xl border border-slate-200 px-4 py-2 hover:bg-slate-50"
                >
                  <span>
                    <span className="block font-medium">{section.label}</span>
                    <span className="text-xs text-slate-600">
                      {t('attendance.studentsCount', { count: section.studentCount })}
                      {section.isClassTeacher ? ` · ${t('attendance.classTeacher')}` : ''}
                    </span>
                  </span>
                  {section.markedToday.length ? (
                    <Badge tone="green">{t('attendance.takenYes')}</Badge>
                  ) : (
                    <Badge tone="amber">{t('attendance.markNow')}</Badge>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <section className="card text-sm text-slate-600">{t('shell.dashboardSoon')}</section>
      )}
    </main>
  );
}
