import RequirePermission from '@/components/auth/RequirePermission';
import AcademicYearsPage from '@/components/admin/AcademicYearsPage';

export default function Page() {
  return (
    <RequirePermission permission="academics.view">
      <AcademicYearsPage />
    </RequirePermission>
  );
}
