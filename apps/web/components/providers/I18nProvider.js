'use client';

import { createContext, useContext, useMemo } from 'react';
import { translate } from '@/lib/i18n/translate';

const I18nContext = createContext(null);

export function I18nProvider({ locale, messages, children }) {
  const value = useMemo(
    () => ({ locale, t: (key, vars) => translate(messages, key, vars) }),
    [locale, messages],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useI18n must be used inside <I18nProvider>');
  return context;
}
