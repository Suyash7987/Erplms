'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { useI18n } from '@/components/providers/I18nProvider';
import { ErrorState, LoadingState } from '@/components/ui/StateViews';

const STATUS_STYLES = {
  ok: 'bg-emerald-100 text-emerald-800',
  degraded: 'bg-amber-100 text-amber-800',
  error: 'bg-red-100 text-red-800',
};

function StatusPill({ status }) {
  const { t } = useI18n();
  const label =
    status === 'ok'
      ? t('home.statusOk')
      : status === 'degraded'
        ? t('home.statusDegraded')
        : t('home.statusDown');
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLES[status] ?? STATUS_STYLES.error}`}
    >
      {label}
    </span>
  );
}

export default function ApiStatus() {
  const { locale, t } = useI18n();
  const [state, setState] = useState({ phase: 'loading' });

  const load = useCallback(async (signal) => {
    setState({ phase: 'loading' });
    try {
      const report = await apiFetch('/health', { signal, timeoutMs: 8_000 });
      setState({ phase: 'ready', report });
    } catch (error) {
      if (signal?.aborted) return;
      if (error instanceof ApiError && error.status === 503 && error.body?.checks) {
        setState({ phase: 'ready', report: error.body });
      } else {
        setState({ phase: 'error' });
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  return (
    <section className="card" aria-labelledby="system-status-heading">
      <h2 id="system-status-heading" className="mb-3 text-base font-semibold">
        {t('home.systemStatus')}
      </h2>

      {state.phase === 'loading' ? <LoadingState /> : null}
      {state.phase === 'error' ? (
        <ErrorState message={t('errors.network')} onRetry={() => load()} />
      ) : null}

      {state.phase === 'ready' ? (
        <>
          <ul className="divide-y divide-slate-100">
            <li className="flex items-center justify-between py-2">
              <span>{t('home.api')}</span>
              <StatusPill status={state.report.status} />
            </li>
            <li className="flex items-center justify-between py-2">
              <span>{t('home.database')}</span>
              <StatusPill status={state.report.checks?.database?.status} />
            </li>
          </ul>
          <p className="mt-3 text-xs text-slate-500">
            {t('home.version', { version: state.report.version })} ·{' '}
            {t('home.checkedAt', {
              time: new Date(state.report.timestamp).toLocaleTimeString(
                locale === 'hi' ? 'hi-IN' : 'en-IN',
                {
                  timeZone: state.report.timezone,
                },
              ),
            })}
          </p>
        </>
      ) : null}
    </section>
  );
}
