'use client';

import { useApiData } from '@/lib/useApiData';

/** Sections of the current academic year as select options ("Class 5 - A"). */
export function useSectionOptions() {
  const sections = useApiData('/sections?limit=100');
  const options = (sections.data?.data ?? [])
    .filter((section) => section.isActive)
    .map((section) => ({ value: section.id, label: `${section.level.name} - ${section.name}` }));
  return {
    options,
    phase: sections.phase,
    error: sections.error,
    academicYearId: sections.data?.academicYearId,
  };
}
