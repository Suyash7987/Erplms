import RequirePermission from '@/components/auth/RequirePermission';
import MyAttendance from '@/components/attendance/MyAttendance';

export default function Page() {
  return (
    <RequirePermission permission="attendance.view_own">
      <MyAttendance />
    </RequirePermission>
  );
}
