import RequirePermission from '@/components/auth/RequirePermission';
import StaffPage from '@/components/admin/staff/StaffPage';

export default function Page() {
  return (
    <RequirePermission permission="staff.view">
      <StaffPage />
    </RequirePermission>
  );
}
