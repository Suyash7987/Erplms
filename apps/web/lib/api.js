const API_BASE = '/api/v1';
const DEFAULT_TIMEOUT_MS = 15_000;

// Endpoints that manage the session themselves and must never trigger an automatic refresh.
const NO_REFRESH_PATHS = new Set(['/auth/login', '/auth/refresh', '/auth/logout']);
const REFRESHABLE_CODES = new Set(['UNAUTHORIZED', 'TOKEN_EXPIRED', 'SESSION_EXPIRED']);

export class ApiError extends Error {
  constructor({ status, code, message, details, body }) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.body = body;
  }

  get isNetworkError() {
    return this.status === 0;
  }

  /** Field errors from a VALIDATION_ERROR, keyed by field path. */
  get fieldErrors() {
    if (this.code !== 'VALIDATION_ERROR' || !Array.isArray(this.details)) return {};
    return Object.fromEntries(this.details.map((detail) => [detail.path, detail.message]));
  }
}

async function request(path, { method = 'GET', body, headers, signal, timeoutMs } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs ?? DEFAULT_TIMEOUT_MS);
  signal?.addEventListener('abort', () => controller.abort(), { once: true });

  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      credentials: 'include',
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (error) {
    throw new ApiError({
      status: 0,
      code: error.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK_ERROR',
      message: error.message,
    });
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 204) return null;
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError({
      status: response.status,
      code: data?.error?.code ?? 'HTTP_ERROR',
      message: data?.error?.message ?? response.statusText,
      details: data?.error?.details,
      body: data,
    });
  }
  return data;
}

// One refresh at a time per page; concurrent 401s wait for the same refresh.
let refreshInFlight = null;

function refreshSession() {
  refreshInFlight ??= request('/auth/refresh', { method: 'POST' })
    .then(() => true)
    .catch((error) => {
      // Another tab rotated the token first; its new cookies are already in place.
      if (error instanceof ApiError && error.code === 'SESSION_REFRESHED') return true;
      return false;
    })
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
}

/**
 * Fetch wrapper for the ERP API. Sends cookies (auth lives in httpOnly cookies), parses the standard
 * `{ error: { code, message, details } }` shape into ApiError, applies a timeout suited to slow
 * mobile networks, and transparently refreshes an expired session once before giving up.
 */
export async function apiFetch(path, options = {}) {
  try {
    return await request(path, options);
  } catch (error) {
    const canRefresh =
      error instanceof ApiError &&
      error.status === 401 &&
      REFRESHABLE_CODES.has(error.code) &&
      !NO_REFRESH_PATHS.has(path);
    if (!canRefresh || !(await refreshSession())) throw error;
    return request(path, options);
  }
}
