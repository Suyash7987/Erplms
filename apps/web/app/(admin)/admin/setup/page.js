import RequirePermission from '@/components/auth/RequirePermission';
import SetupWizard from '@/components/admin/SetupWizard';

export default function SetupPage() {
  return (
    <RequirePermission permission="institute.manage">
      <SetupWizard />
    </RequirePermission>
  );
}
