import RequirePermission from '@/components/auth/RequirePermission';
import StudentsPage from '@/components/admin/students/StudentsPage';

export default function Page() {
  return (
    <RequirePermission permission="students.view">
      <StudentsPage />
    </RequirePermission>
  );
}
