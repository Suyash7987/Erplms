export const LOCALES = ['en', 'hi'];
export const DEFAULT_LOCALE = 'en';
export const LOCALE_COOKIE = 'locale';

export const LOCALE_LABELS = {
  en: 'English',
  hi: 'हिन्दी',
};

export function resolveLocale(value) {
  return LOCALES.includes(value) ? value : DEFAULT_LOCALE;
}
