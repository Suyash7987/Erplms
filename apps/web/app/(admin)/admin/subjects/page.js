import RequirePermission from '@/components/auth/RequirePermission';
import SubjectsPage from '@/components/admin/SubjectsPage';

export default function Page() {
  return (
    <RequirePermission permission="academics.view">
      <SubjectsPage />
    </RequirePermission>
  );
}
