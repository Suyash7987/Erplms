import ProfilePicker from '@/components/auth/ProfilePicker';
import { getTranslator } from '@/lib/i18n/server';

export async function generateMetadata() {
  const { t } = await getTranslator();
  return { title: t('profile.title') };
}

export default function SelectProfilePage() {
  return <ProfilePicker />;
}
