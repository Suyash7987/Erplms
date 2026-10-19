import { ApiError } from '@/lib/api';

/** Translates an API error from the sign-in or onboarding flow into a user-facing message. */
export function authErrorMessage(t, error) {
  if (!(error instanceof ApiError)) return t('errors.generic');
  if (error.isNetworkError) return t('errors.network');

  switch (error.code) {
    case 'INVALID_CREDENTIALS':
      return t('auth.errors.invalidCredentials');
    case 'ACCOUNT_LOCKED':
      return t('auth.errors.locked', {
        minutes: Math.max(1, Math.ceil((error.details?.retryAfterSeconds ?? 60) / 60)),
      });
    case 'ACCOUNT_DISABLED':
      return t('auth.errors.disabled');
    case 'RATE_LIMITED':
      return t('auth.errors.rateLimited');
    case 'FORBIDDEN':
      return t('auth.errors.noRole');
    case 'SESSION_EXPIRED':
    case 'UNAUTHORIZED':
      return t('auth.errors.sessionExpired');
    default:
      return t('errors.generic');
  }
}
