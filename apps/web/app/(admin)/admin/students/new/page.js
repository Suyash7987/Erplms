import RequirePermission from '@/components/auth/RequirePermission';
import NewStudentPage from '@/components/admin/students/NewStudentPage';

export default function Page() {
  return (
    <RequirePermission permission="students.create">
      <NewStudentPage />
    </RequirePermission>
  );
}
