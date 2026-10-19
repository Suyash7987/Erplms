import RequirePermission from '@/components/auth/RequirePermission';
import ClassesPage from '@/components/admin/ClassesPage';

export default function Page() {
  return (
    <RequirePermission permission="academics.view">
      <ClassesPage />
    </RequirePermission>
  );
}
