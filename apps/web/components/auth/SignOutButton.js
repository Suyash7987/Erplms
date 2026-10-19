'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/components/providers/I18nProvider';
import { useAuth } from '@/components/providers/AuthProvider';

export default function SignOutButton({ className = 'btn-secondary', label }) {
  const { t } = useI18n();
  const { logout } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onClick() {
    setBusy(true);
    await logout();
    router.replace('/login');
  }

  return (
    <button type="button" onClick={onClick} disabled={busy} className={className}>
      {label ?? t('auth.signOut')}
    </button>
  );
}
