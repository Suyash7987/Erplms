import { ApiError } from '@/lib/api';

/**
 * User-facing message for a failed admin action. Network and server errors are translated;
 * 4xx answers carry a specific message from the API (English for now).
 */
export function apiErrorMessage(t, error) {
  if (!(error instanceof ApiError)) return t('errors.generic');
  if (error.isNetworkError) return t('errors.network');
  if (error.status === 403) return t('errors.forbidden');
  if (error.status >= 400 && error.status < 500 && error.message) return error.message;
  return t('errors.generic');
}
