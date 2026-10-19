'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/components/providers/I18nProvider';
import { useAuth, useRequireSession } from '@/components/providers/AuthProvider';
import { LoadingState } from '@/components/ui/StateViews';
import { nextPathFor } from '@/lib/auth-routes';
import AuthCard from './AuthCard';
import SignOutButton from './SignOutButton';
import { authErrorMessage } from './authErrors';
import { profileLabel } from './profileLabel';

export default function ProfilePicker() {
  const { t } = useI18n();
  const { session, switchProfile } = useAuth();
  const router = useRouter();
  const ready = useRequireSession();
  const [pendingKey, setPendingKey] = useState(null);
  const [error, setError] = useState(null);

  if (!ready) return <LoadingState />;

  async function choose(profile) {
    setError(null);
    if (profile.key === session.activeProfile.key) {
      router.replace(nextPathFor(session));
      return;
    }
    setPendingKey(profile.key);
    try {
      const next = await switchProfile(profile.key);
      router.replace(nextPathFor(next));
    } catch (switchError) {
      setPendingKey(null);
      setError(authErrorMessage(t, switchError));
    }
  }

  return (
    <AuthCard
      title={t('profile.title')}
      subtitle={t('profile.subtitle')}
      footer={
        <div className="flex justify-center">
          <SignOutButton />
        </div>
      }
    >
      {error ? (
        <p role="alert" className="alert-error">
          {error}
        </p>
      ) : null}
      <ul className="flex flex-col gap-3">
        {session.profiles.map((profile) => {
          const active = profile.key === session.activeProfile.key;
          return (
            <li key={profile.key}>
              <button
                type="button"
                onClick={() => choose(profile)}
                disabled={pendingKey !== null}
                aria-current={active ? 'true' : undefined}
                className={`flex min-h-16 w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition-colors disabled:opacity-60 ${
                  active
                    ? 'border-brand-500 bg-brand-50'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <span className="flex flex-col">
                  <span className="font-semibold text-slate-900">{profileLabel(t, profile)}</span>
                  {profile.detail ? (
                    <span className="text-sm text-slate-600">{profile.detail}</span>
                  ) : null}
                </span>
                <span className="text-sm font-medium text-brand-700">
                  {pendingKey === profile.key
                    ? t('profile.switching')
                    : active
                      ? t('profile.active')
                      : ''}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </AuthCard>
  );
}
