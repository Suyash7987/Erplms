const API_BASE = '/api/v1';
const DEFAULT_TIMEOUT_MS = 15_000;

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
}

/**
 * Fetch wrapper for the ERP API. Sends cookies (auth lives in httpOnly cookies),
 * parses the standard `{ error: { code, message, details } }` shape into ApiError,
 * and applies a timeout suited to slow mobile networks.
 */
export async function apiFetch(path, { method = 'GET', body, headers, signal, timeoutMs } = {}) {
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
