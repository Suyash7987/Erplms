'use client';

import { useState } from 'react';
import { useI18n } from '@/components/providers/I18nProvider';
import { apiErrorMessage } from '@/lib/apiErrors';

/** Runs an async action with busy and translated error state. Returns undefined on failure. */
export function useAction() {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function run(work) {
    setBusy(true);
    setError(null);
    try {
      return await work();
    } catch (failure) {
      setError(apiErrorMessage(t, failure));
      return undefined;
    } finally {
      setBusy(false);
    }
  }

  return { busy, error, setError, run };
}
