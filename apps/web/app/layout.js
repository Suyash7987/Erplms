import './globals.css';
import { getTranslator } from '@/lib/i18n/server';
import { I18nProvider } from '@/components/providers/I18nProvider';
import { AuthProvider } from '@/components/providers/AuthProvider';
import ServiceWorkerRegister from '@/components/pwa/ServiceWorkerRegister';

export async function generateMetadata() {
  const { t } = await getTranslator();
  return {
    title: { default: t('app.name'), template: `%s · ${t('app.name')}` },
    description: t('app.tagline'),
    applicationName: t('app.name'),
    appleWebApp: { capable: true, title: t('app.name'), statusBarStyle: 'default' },
    formatDetection: { telephone: false },
    icons: { icon: '/icons/icon-192.png', apple: '/icons/icon-192.png' },
  };
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#4f46e5',
};

export default async function RootLayout({ children }) {
  const { locale, messages } = await getTranslator();

  return (
    <html lang={locale}>
      <body className="min-h-dvh bg-slate-50 font-sans text-slate-900 antialiased">
        <I18nProvider locale={locale} messages={messages}>
          <AuthProvider>{children}</AuthProvider>
        </I18nProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
