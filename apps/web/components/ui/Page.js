'use client';

/** Page title with an optional description and action area. */
export function PageHeader({ title, description, actions }) {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
        {description ? <p className="mt-1 text-sm text-slate-600">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}

/** Success or error message announced to screen readers. */
export function Notice({ tone = 'success', children }) {
  if (!children) return null;
  const styles =
    tone === 'error'
      ? 'border-red-200 bg-red-50 text-red-800'
      : 'border-emerald-200 bg-emerald-50 text-emerald-800';
  return (
    <p
      role={tone === 'error' ? 'alert' : 'status'}
      className={`rounded-xl border p-3 text-sm ${styles}`}
    >
      {children}
    </p>
  );
}

const BADGE_STYLES = {
  green: 'bg-emerald-100 text-emerald-800',
  amber: 'bg-amber-100 text-amber-800',
  slate: 'bg-slate-100 text-slate-700',
  brand: 'bg-brand-100 text-brand-700',
};

export function Badge({ tone = 'slate', children }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${BADGE_STYLES[tone]}`}
    >
      {children}
    </span>
  );
}
