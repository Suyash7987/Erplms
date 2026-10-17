/**
 * Looks up a dot-separated key (e.g. "home.signIn") and interpolates {placeholders}.
 * Safe to import from client components: it carries no message catalogs.
 */
export function translate(messages, key, vars) {
  const value = key.split('.').reduce((node, part) => node?.[part], messages);
  if (typeof value !== 'string') return key;
  if (!vars) return value;
  return value.replace(/\{(\w+)\}/g, (match, name) =>
    vars[name] === undefined ? match : String(vars[name]),
  );
}
