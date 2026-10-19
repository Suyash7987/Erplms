import LoginForm from '@/components/auth/LoginForm';
import { getTranslator } from '@/lib/i18n/server';

export async function generateMetadata() {
  const { t } = await getTranslator();
  return { title: t('auth.signInTitle') };
}

export default function LoginPage() {
  return <LoginForm />;
}
