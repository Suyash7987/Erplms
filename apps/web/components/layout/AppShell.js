'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useI18n } from '@/components/providers/I18nProvider';
import { useAuth, useRequireSession } from '@/components/providers/AuthProvider';
import { ErrorState, LoadingState } from '@/components/ui/StateViews';
import SignOutButton from '@/components/auth/SignOutButton';
import { profileLabel } from '@/components/auth/profileLabel';
import { homePathFor } from '@/lib/auth-routes';
import { isActivePath, navItemsFor } from '@/lib/navigation';

/**
 * Signed-in frame for a role area (/admin, /teacher, /parent, /student). Sends users to their own
 * area if they open another one; navigation is added per module as features land.
 */
export default function AppShell({ area, children }) {
  const { t } = useI18n();
  const { status, session, reload } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const ready = useRequireSession();
  const home = session ? homePathFor(session.activeProfile) : null;

  useEffect(() => {
    if (ready && home !== area) router.replace(home);
  }, [ready, home, area, router]);

  if (status === 'error') {
    return (
      <main className="mx-auto w-full max-w-md px-4 py-8">
        <ErrorState message={t('errors.network')} onRetry={reload} />
      </main>
    );
  }
  if (!ready || home !== area) {
    return (
      <main className="mx-auto w-full max-w-md px-4 py-8">
        <LoadingState />
      </main>
    );
  }

  const navItems = navItemsFor(area, session);

  return (
    <div className="min-h-dvh">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-brand-700">
              {session.institute.name}
            </p>
            <p className="truncate text-xs text-slate-600">
              {profileLabel(t, session.activeProfile)}
            </p>
          </div>
          <nav className="flex shrink-0 items-center gap-2" aria-label={t('shell.accountMenu')}>
            {session.profiles.length > 1 ? (
              <Link href="/select-profile" className="btn-secondary px-3">
                {t('profile.switch')}
              </Link>
            ) : null}
            <SignOutButton className="btn-secondary px-3" />
          </nav>
        </div>
        {navItems.length > 1 ? (
          <nav
            aria-label={t('shell.mainMenu')}
            className="mx-auto w-full max-w-4xl overflow-x-auto"
          >
            <ul className="flex gap-1 px-2 pb-2">
              {navItems.map((item) => {
                const active = isActivePath(item, pathname);
                return (
                  <li key={item.href} className="shrink-0">
                    <Link
                      href={item.href}
                      aria-current={active ? 'page' : undefined}
                      className={`inline-flex min-h-10 items-center rounded-lg px-3 text-sm font-medium ${
                        active ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {t(item.labelKey)}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        ) : null}
      </header>
      <div className="mx-auto w-full max-w-4xl">{children}</div>
    </div>
  );
}
