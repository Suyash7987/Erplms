'use client';

import Link from 'next/link';
import { useI18n } from '@/components/providers/I18nProvider';
import { useAuth } from '@/components/providers/AuthProvider';
import { LoadingState } from '@/components/ui/StateViews';
import { useApiData } from '@/lib/useApiData';
import { useLabels } from '@/lib/useLabels';

export default function AdminHome() {
  const { t } = useI18n();
  const { session, can } = useAuth();
  const labels = useLabels();
  const setup = useApiData(can('institute.view') ? '/institute/setup' : null);
  const status = setup.data;

  return (
    <main className="flex flex-col gap-4 px-4 py-6">
      <h1 className="text-xl font-semibold">{t('shell.welcome', { name: session.user.name })}</h1>

      {can('institute.view') && setup.phase === 'loading' ? <LoadingState /> : null}

      {status && !status.completed && can('institute.manage') ? (
        <section className="card flex flex-col gap-3 border-brand-500 bg-brand-50">
          <h2 className="font-semibold text-brand-700">{t('setup.bannerTitle')}</h2>
          <p className="text-sm text-slate-700">{t('setup.bannerBody')}</p>
          <Link href="/admin/setup" className="btn-primary self-start">
            {t('setup.bannerAction')}
          </Link>
        </section>
      ) : null}

      {status ? (
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat
            label={t('setup.currentYear')}
            value={status.currentAcademicYear?.name ?? t('setup.notSet')}
          />
          <Stat
            label={t('admin.levelsCount', { level: labels.level })}
            value={status.counts.levels}
          />
          <Stat
            label={t('admin.sectionsCount', { section: labels.section })}
            value={status.counts.sections}
          />
          <Stat label={t('nav.subjects')} value={status.counts.subjects} />
        </section>
      ) : null}

      <section className="card text-sm text-slate-600">{t('shell.dashboardSoon')}</section>
    </main>
  );
}

function Stat({ label, value }) {
  return (
    <div className="card flex flex-col gap-1 p-3">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <span className="text-lg font-semibold text-slate-900">{value}</span>
    </div>
  );
}
