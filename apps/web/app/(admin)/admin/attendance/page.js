import RequirePermission from '@/components/auth/RequirePermission';
import MarkAttendance from '@/components/attendance/MarkAttendance';

export default async function Page({ searchParams }) {
  const { sectionId } = await searchParams;
  return (
    <RequirePermission permission="attendance.mark">
      <MarkAttendance initialSectionId={sectionId} />
    </RequirePermission>
  );
}
