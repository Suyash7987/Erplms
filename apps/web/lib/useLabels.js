'use client';

import { useAuth } from '@/components/providers/AuthProvider';
import { useI18n } from '@/components/providers/I18nProvider';

/**
 * Institute-configurable names for the academic structure, e.g. "Class"/"Section" for schools or
 * "Batch"/"Group" for coaching. Falls back to the translated defaults.
 */
export function useLabels() {
  const { session } = useAuth();
  const { t } = useI18n();
  const labels = session?.institute?.labels ?? {};
  return {
    level: labels.level || t('labels.level'),
    section: labels.section || t('labels.section'),
  };
}
