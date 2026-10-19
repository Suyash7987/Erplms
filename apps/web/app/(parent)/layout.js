import AppShell from '@/components/layout/AppShell';

export default function ParentLayout({ children }) {
  return <AppShell area="/parent">{children}</AppShell>;
}
