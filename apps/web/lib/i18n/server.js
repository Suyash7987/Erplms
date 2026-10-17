import { cookies } from 'next/headers';
import en from './messages/en.json';
import hi from './messages/hi.json';
import { DEFAULT_LOCALE, LOCALE_COOKIE, resolveLocale } from './config';
import { translate } from './translate';

const catalogs = { en, hi };

function deepMerge(base, override) {
  const result = { ...base };
  for (const [key, value] of Object.entries(override ?? {})) {
    result[key] =
      value && typeof value === 'object' && !Array.isArray(value)
        ? deepMerge(base?.[key], value)
        : value;
  }
  return result;
}

/** Messages for `locale`, with any missing keys filled from the default (English) catalog. */
export function getMessages(locale) {
  const resolved = resolveLocale(locale);
  if (resolved === DEFAULT_LOCALE) return catalogs[DEFAULT_LOCALE];
  return deepMerge(catalogs[DEFAULT_LOCALE], catalogs[resolved]);
}

export async function getLocale() {
  const cookieStore = await cookies();
  return resolveLocale(cookieStore.get(LOCALE_COOKIE)?.value);
}

/** Translator for server components. */
export async function getTranslator() {
  const locale = await getLocale();
  const messages = getMessages(locale);
  return { locale, messages, t: (key, vars) => translate(messages, key, vars) };
}
