import RequirePermission from '@/components/auth/RequirePermission';
import AttendanceReports from '@/components/attendance/AttendanceReports';

export default function Page() {
  return (
    <RequirePermission permission="attendance.report">
      <AttendanceReports />
    </RequirePermission>
  );
}
