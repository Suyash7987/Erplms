import RequirePermission from '@/components/auth/RequirePermission';
import SectionDetailPage from '@/components/admin/SectionDetailPage';

export default async function Page({ params }) {
  const { sectionId } = await params;
  return (
    <RequirePermission permission="academics.view">
      <SectionDetailPage sectionId={sectionId} />
    </RequirePermission>
  );
}
