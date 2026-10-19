import ConsentForm from '@/components/auth/ConsentForm';
import { getTranslator } from '@/lib/i18n/server';

export async function generateMetadata() {
  const { t } = await getTranslator();
  return { title: t('consent.title') };
}

export default function ConsentPage() {
  return <ConsentForm />;
}
