'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api';

/**
 * Loads `path` from the API and tracks loading / ready / error. Pass `null` to skip loading.
 * `reload()` refetches while keeping the previous data on screen.
 */
export function useApiData(path) {
  const [state, setState] = useState({ phase: 'loading', data: null, error: null });
  const latest = useRef(0);

  const load = useCallback(async () => {
    if (!path) return;
    const requestId = ++latest.current;
    setState((current) => ({ ...current, phase: current.data ? 'refreshing' : 'loading' }));
    try {
      const data = await apiFetch(path);
      if (requestId === latest.current) setState({ phase: 'ready', data, error: null });
    } catch (error) {
      if (requestId === latest.current) setState({ phase: 'error', data: null, error });
    }
  }, [path]);

  useEffect(() => {
    load();
  }, [load]);

  return { ...state, reload: load };
}
