import Link from 'next/link';
import { getTranslator } from '@/lib/i18n/server';

export default async function NotFound() {
  const { t } = await getTranslator();

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-12">
      <h1 className="text-xl font-semibold">{t('errors.notFoundTitle')}</h1>
      <p className="text-slate-600">{t('errors.notFoundBody')}</p>
      <Link href="/" className="btn-secondary self-start">
        {t('common.goHome')}
      </Link>
    </main>
  );
}
