import RequirePermission from '@/components/auth/RequirePermission';
import SettingsPage from '@/components/admin/SettingsPage';

export default function Page() {
  return (
    <RequirePermission permission="institute.view">
      <SettingsPage />
    </RequirePermission>
  );
}
