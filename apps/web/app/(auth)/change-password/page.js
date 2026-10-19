import ChangePasswordForm from '@/components/auth/ChangePasswordForm';
import { getTranslator } from '@/lib/i18n/server';

export async function generateMetadata() {
  const { t } = await getTranslator();
  return { title: t('password.title') };
}

export default function ChangePasswordPage() {
  return <ChangePasswordForm />;
}
