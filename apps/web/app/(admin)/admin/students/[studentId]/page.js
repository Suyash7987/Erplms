import RequirePermission from '@/components/auth/RequirePermission';
import StudentProfile from '@/components/admin/students/StudentProfile';

export default async function Page({ params }) {
  const { studentId } = await params;
  return (
    <RequirePermission permission="students.view">
      <StudentProfile studentId={studentId} />
    </RequirePermission>
  );
}
