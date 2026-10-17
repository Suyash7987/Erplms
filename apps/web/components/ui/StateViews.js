'use client';

import { useI18n } from '@/components/providers/I18nProvider';

export function LoadingState({ label }) {
  const { t } = useI18n();
  return (
    <div role="status" aria-live="polite" className="flex items-center gap-3 py-6 text-slate-600">
      <span
        aria-hidden="true"
        className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600"
      />
      <span>{label ?? t('common.loading')}</span>
    </div>
  );
}

export function EmptyState({ title, description, action }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center gap-2 py-8 text-center">
      <p className="font-medium text-slate-800">{title ?? t('common.empty')}</p>
      {description ? <p className="text-sm text-slate-500">{description}</p> : null}
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  const { t } = useI18n();
  return (
    <div role="alert" className="flex flex-col items-start gap-3 py-4">
      <p className="text-sm text-red-700">{message ?? t('errors.generic')}</p>
      {onRetry ? (
        <button type="button" onClick={onRetry} className="btn-secondary">
          {t('common.retry')}
        </button>
      ) : null}
    </div>
  );
}
