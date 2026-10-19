import ImportPage from '@/components/admin/ImportPage';

export default async function Page({ searchParams }) {
  const { type } = await searchParams;
  return <ImportPage initialType={type} />;
}
