'use client';

import { useI18n } from '@/components/providers/I18nProvider';

/** Previous / next pager for list endpoints that return { meta: { page, totalPages, total } }. */
export default function Pagination({ meta, onPage }) {
  const { t } = useI18n();
  if (!meta || meta.totalPages <= 1) {
    return meta ? (
      <p className="text-sm text-slate-500">{t('common.totalCount', { count: meta.total })}</p>
    ) : null;
  }
  return (
    <nav className="flex items-center justify-between gap-2" aria-label={t('common.pagination')}>
      <button
        type="button"
        className="btn-secondary"
        disabled={meta.page <= 1}
        onClick={() => onPage(meta.page - 1)}
      >
        {t('common.previous')}
      </button>
      <span className="text-sm text-slate-600">
        {t('common.pageOf', { page: meta.page, pages: meta.totalPages, count: meta.total })}
      </span>
      <button
        type="button"
        className="btn-secondary"
        disabled={meta.page >= meta.totalPages}
        onClick={() => onPage(meta.page + 1)}
      >
        {t('common.next')}
      </button>
    </nav>
  );
}
