'use client';

import { useAuth } from '@/components/providers/AuthProvider';
import { useI18n } from '@/components/providers/I18nProvider';

/** Renders children only when the active role has the permission; otherwise a short notice. */
export default function RequirePermission({ permission, children }) {
  const { can } = useAuth();
  const { t } = useI18n();

  if (can(permission)) return children;
  return (
    <main className="px-4 py-8">
      <p role="alert" className="alert-error">
        {t('errors.forbidden')}
      </p>
    </main>
  );
}
