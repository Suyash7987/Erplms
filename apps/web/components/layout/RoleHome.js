'use client';

import { useI18n } from '@/components/providers/I18nProvider';
import { useAuth } from '@/components/providers/AuthProvider';

/** Placeholder home for each role until the dashboards (M10) arrive. */
export default function RoleHome({ titleKey }) {
  const { t } = useI18n();
  const { session } = useAuth();

  return (
    <main className="flex flex-col gap-4 px-4 py-6">
      <h1 className="text-xl font-semibold">{t('shell.welcome', { name: session.user.name })}</h1>
      <section className="card flex flex-col gap-2">
        <p className="text-sm font-medium uppercase tracking-wide text-brand-600">{t(titleKey)}</p>
        {session.activeProfile.detail ? (
          <p className="text-slate-700">
            {session.activeProfile.label} · {session.activeProfile.detail}
          </p>
        ) : null}
        <p className="text-slate-600">{t('shell.dashboardSoon')}</p>
      </section>
    </main>
  );
}
