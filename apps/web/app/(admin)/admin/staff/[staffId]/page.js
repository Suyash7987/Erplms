import RequirePermission from '@/components/auth/RequirePermission';
import StaffProfile from '@/components/admin/staff/StaffProfile';

export default async function Page({ params }) {
  const { staffId } = await params;
  return (
    <RequirePermission permission="staff.view">
      <StaffProfile staffId={staffId} />
    </RequirePermission>
  );
}
