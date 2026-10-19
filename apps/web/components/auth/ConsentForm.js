'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/components/providers/I18nProvider';
import { useAuth, useRequireSession } from '@/components/providers/AuthProvider';
import { ErrorState, LoadingState } from '@/components/ui/StateViews';
import { apiFetch, ApiError } from '@/lib/api';
import { nextPathFor } from '@/lib/auth-routes';
import AuthCard from './AuthCard';
import SignOutButton from './SignOutButton';

const PARAGRAPHS = ['p1', 'p2', 'p3', 'p4', 'p5'];

/** DPDP parental consent, shown to parents before they can see their children's data. */
export default function ConsentForm() {
  const { t } = useI18n();
  const { session, setSession } = useAuth();
  const router = useRouter();
  const ready = useRequireSession({ allowPending: true });
  const [state, setState] = useState({ phase: 'loading' });
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState(null);

  const load = useCallback(async () => {
    setState({ phase: 'loading' });
    try {
      setState({ phase: 'ready', consent: await apiFetch('/auth/consent') });
    } catch {
      setState({ phase: 'error' });
    }
  }, []);

  useEffect(() => {
    if (!ready || submitting) return;
    if (!session.consentPending) {
      router.replace(nextPathFor(session));
      return;
    }
    load();
  }, [ready, submitting, session, load, router]);

  if (!ready || state.phase === 'loading') return <LoadingState />;

  async function onSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setNotice(null);
    try {
      const next = await apiFetch('/auth/consent', {
        method: 'POST',
        body: { version: state.consent.version, accept: true },
      });
      setSession(next);
      router.replace(nextPathFor(next, { afterLogin: true }));
    } catch (error) {
      setSubmitting(false);
      if (error instanceof ApiError && error.status === 409) {
        setNotice(t('consent.changed'));
        setAgreed(false);
        load();
      } else {
        setNotice(t('errors.generic'));
      }
    }
  }

  return (
    <AuthCard title={t('consent.title')} subtitle={t('consent.subtitle')}>
      {state.phase === 'error' ? (
        <ErrorState message={t('errors.network')} onRetry={load} />
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          {notice ? (
            <p role="alert" className="alert-error">
              {notice}
            </p>
          ) : null}

          <div className="max-h-80 overflow-y-auto rounded-xl bg-slate-50 p-3 text-sm leading-relaxed text-slate-700">
            {PARAGRAPHS.map((key) => (
              <p key={key} className="mb-2 last:mb-0">
                {t(`consent.${key}`, { school: session.institute.name })}
              </p>
            ))}
          </div>

          <div>
            <p className="mb-1 text-sm font-medium text-slate-700">{t('consent.forChildren')}</p>
            <ul className="list-inside list-disc text-sm text-slate-700">
              {state.consent.pendingStudents.map((student) => (
                <li key={student.id}>
                  {student.name}
                  {student.detail ? ` (${student.detail})` : ''}
                </li>
              ))}
            </ul>
          </div>

          <label className="flex min-h-11 items-start gap-3 text-sm text-slate-800">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(event) => setAgreed(event.target.checked)}
              className="mt-0.5 h-5 w-5 rounded border-slate-300 text-brand-600"
            />
            <span>{t('consent.agreeLabel')}</span>
          </label>

          <button type="submit" className="btn-primary w-full" disabled={!agreed || submitting}>
            {submitting ? t('consent.saving') : t('consent.agree')}
          </button>
          <SignOutButton className="btn-secondary w-full" label={t('consent.decline')} />
        </form>
      )}
    </AuthCard>
  );
}
