import Link from 'next/link';
import { getTranslator } from '@/lib/i18n/server';

export default async function ComingSoon({ titleKey }) {
  const { t } = await getTranslator();

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-12">
      <p className="text-sm font-medium uppercase tracking-wide text-brand-600">
        {t('common.comingSoon')}
      </p>
      <h1 className="text-xl font-semibold">{t(titleKey)}</h1>
      <p className="text-slate-600">{t('common.comingSoonBody')}</p>
      <Link href="/" className="btn-secondary self-start">
        {t('common.goHome')}
      </Link>
    </main>
  );
}
