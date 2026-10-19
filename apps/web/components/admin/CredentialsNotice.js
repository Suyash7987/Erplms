'use client';

import { useI18n } from '@/components/providers/I18nProvider';
import ResponsiveTable from '@/components/ui/ResponsiveTable';
import { downloadCsv } from '@/lib/csv';

/**
 * Temporary passwords for newly created logins. The API returns them exactly once, so this panel
 * is the only chance to copy, download or print them.
 */
export default function CredentialsNotice({ credentials, filename = 'temporary-passwords.csv' }) {
  const { t } = useI18n();
  if (!credentials?.length) return null;

  const download = () =>
    downloadCsv(
      [
        ['name', 'phone', 'role', 'temporary_password'],
        ...credentials.map((c) => [c.name, c.phone, c.role, c.temporaryPassword]),
      ],
      filename,
    );

  return (
    <section
      className="card flex flex-col gap-3 border-amber-300 bg-amber-50"
      aria-labelledby="credentials-title"
    >
      <div>
        <h2 id="credentials-title" className="font-semibold text-amber-900">
          {t('credentials.title', { count: credentials.length })}
        </h2>
        <p className="text-sm text-amber-900">{t('credentials.warning')}</p>
      </div>
      <ResponsiveTable
        caption={t('credentials.title', { count: credentials.length })}
        rowKey="phone"
        rows={credentials}
        columns={[
          { key: 'name', header: t('credentials.name'), primary: true },
          { key: 'phone', header: t('credentials.phone') },
          {
            key: 'role',
            header: t('credentials.role'),
            // Custom roles have no translation; show their code.
            render: (c) => {
              const label = t(`credentials.roles.${c.role}`);
              return label.startsWith('credentials.') ? c.role : label;
            },
          },
          {
            key: 'temporaryPassword',
            header: t('credentials.password'),
            render: (c) => (
              <code className="rounded bg-white px-2 py-0.5 font-mono text-base">
                {c.temporaryPassword}
              </code>
            ),
          },
        ]}
      />
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-primary" onClick={download}>
          {t('credentials.download')}
        </button>
        <button type="button" className="btn-secondary" onClick={() => window.print()}>
          {t('credentials.print')}
        </button>
      </div>
    </section>
  );
}
