'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { nextPathFor } from '@/lib/auth-routes';

const AuthContext = createContext(null);

/**
 * Holds the signed-in session returned by the API (user, institute, active profile, profiles,
 * permissions, onboarding flags). Tokens never reach JavaScript: they live in httpOnly cookies.
 */
export function AuthProvider({ children }) {
  const [state, setState] = useState({ status: 'loading', session: null, error: null });

  const load = useCallback(async () => {
    try {
      const session = await apiFetch('/auth/me');
      setState({ status: 'signedIn', session, error: null });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setState({ status: 'signedOut', session: null, error: null });
      } else {
        setState({ status: 'error', session: null, error });
      }
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const value = useMemo(
    () => ({
      ...state,
      reload: load,
      setSession: (session) => setState({ status: 'signedIn', session, error: null }),
      async login(credentials) {
        const session = await apiFetch('/auth/login', { method: 'POST', body: credentials });
        setState({ status: 'signedIn', session, error: null });
        return session;
      },
      async switchProfile(profileKey) {
        const session = await apiFetch('/auth/switch-profile', {
          method: 'POST',
          body: { profileKey },
        });
        setState({ status: 'signedIn', session, error: null });
        return session;
      },
      async logout() {
        await apiFetch('/auth/logout', { method: 'POST' }).catch(() => null);
        setState({ status: 'signedOut', session: null, error: null });
      },
      can: (permission) => Boolean(state.session?.permissions.includes(permission)),
    }),
    [state, load],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}

/**
 * Redirects to /login when signed out and (unless allowPending) to the pending onboarding step.
 * Returns true once the page may render.
 */
export function useRequireSession({ allowPending = false } = {}) {
  const { status, session } = useAuth();
  const router = useRouter();
  const onboardingDone = session && !session.mustChangePassword && !session.consentPending;

  useEffect(() => {
    if (status === 'signedOut') router.replace('/login');
    if (status === 'signedIn' && !allowPending && !onboardingDone) {
      router.replace(nextPathFor(session));
    }
  }, [status, session, allowPending, onboardingDone, router]);

  return status === 'signedIn' && (allowPending || onboardingDone);
}
