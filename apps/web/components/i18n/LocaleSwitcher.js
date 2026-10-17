'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { LOCALES, LOCALE_COOKIE, LOCALE_LABELS } from '@/lib/i18n/config';
import { useI18n } from '@/components/providers/I18nProvider';

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export default function LocaleSwitcher() {
  const { locale, t } = useI18n();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function onChange(event) {
    document.cookie = `${LOCALE_COOKIE}=${event.target.value}; path=/; max-age=${ONE_YEAR_SECONDS}; samesite=lax`;
    startTransition(() => router.refresh());
  }

  return (
    <label className="inline-flex items-center gap-2 text-sm text-slate-600">
      <span>{t('common.language')}</span>
      <select
        value={locale}
        onChange={onChange}
        disabled={isPending}
        className="min-h-11 rounded-lg border border-slate-300 bg-white px-2 text-slate-900"
      >
        {LOCALES.map((code) => (
          <option key={code} value={code}>
            {LOCALE_LABELS[code]}
          </option>
        ))}
      </select>
    </label>
  );
}
