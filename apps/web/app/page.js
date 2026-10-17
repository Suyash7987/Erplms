import Link from 'next/link';
import { getTranslator } from '@/lib/i18n/server';
import ApiStatus from '@/components/system/ApiStatus';
import LocaleSwitcher from '@/components/i18n/LocaleSwitcher';

export default async function HomePage() {
  const { t } = await getTranslator();

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold text-brand-700">{t('app.name')}</h1>
        <p className="text-slate-600">{t('app.tagline')}</p>
      </header>

      <ApiStatus />

      <Link href="/login" className="btn-primary w-full">
        {t('home.signIn')}
      </Link>

      <footer className="mt-auto flex justify-center">
        <LocaleSwitcher />
      </footer>
    </main>
  );
}
