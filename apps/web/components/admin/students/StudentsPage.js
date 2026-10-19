'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useI18n } from '@/components/providers/I18nProvider';
import { useAuth } from '@/components/providers/AuthProvider';
import { ErrorState, LoadingState } from '@/components/ui/StateViews';
import { FormField, SelectField } from '@/components/ui/FormField';
import { Badge, PageHeader } from '@/components/ui/Page';
import Pagination from '@/components/ui/Pagination';
import ResponsiveTable from '@/components/ui/ResponsiveTable';
import { apiErrorMessage } from '@/lib/apiErrors';
import { useApiData } from '@/lib/useApiData';
import { useSectionOptions } from '@/lib/useSectionOptions';

export const STUDENT_STATUSES = ['active', 'inactive', 'transferred', 'passed_out', 'left'];
export const STATUS_TONE = {
  active: 'green',
  inactive: 'amber',
  transferred: 'slate',
  passed_out: 'brand',
  left: 'slate',
};

export default function StudentsPage() {
  const { t } = useI18n();
  const { can } = useAuth();
  const sections = useSectionOptions();
  const [draft, setDraft] = useState('');
  const [filters, setFilters] = useState({ q: '', sectionId: '', status: 'active', page: 1 });

  const params = new URLSearchParams({
    page: String(filters.page),
    limit: '20',
    status: filters.status,
  });
  if (filters.q) params.set('q', filters.q);
  if (filters.sectionId) params.set('sectionId', filters.sectionId);
  const students = useApiData(`/students?${params}`);

  const setFilter = (field) => (event) =>
    setFilters((current) => ({ ...current, [field]: event.target.value, page: 1 }));

  const columns = [
    {
      key: 'name',
      header: t('students.name'),
      primary: true,
      render: (s) => (
        <Link
          href={`/admin/students/${s.id}`}
          className="font-semibold text-brand-700 hover:underline"
        >
          {s.name}
        </Link>
      ),
    },
    { key: 'admissionNo', header: t('students.admissionNo') },
    {
      key: 'section',
      header: t('students.class'),
      render: (s) =>
        s.enrollment ? `${s.enrollment.section.level.name} - ${s.enrollment.section.name}` : '—',
    },
    { key: 'rollNo', header: t('students.rollNo'), render: (s) => s.enrollment?.rollNo ?? '—' },
    {
      key: 'guardian',
      header: t('students.guardian'),
      render: (s) =>
        s.primaryGuardian ? (
          <span>
            {s.primaryGuardian.name}{' '}
            <a href={`tel:${s.primaryGuardian.phone}`} className="text-brand-700">
              {s.primaryGuardian.phone}
            </a>
          </span>
        ) : (
          '—'
        ),
    },
    {
      key: 'status',
      header: t('students.status'),
      render: (s) => (
        <Badge tone={STATUS_TONE[s.status]}>{t(`students.statuses.${s.status}`)}</Badge>
      ),
    },
  ];

  return (
    <main className="flex flex-col gap-4 px-4 py-6">
      <PageHeader
        title={t('nav.students')}
        description={t('students.description')}
        actions={
          <>
            {can('students.create') ? (
              <Link href="/admin/students/new" className="btn-primary">
                {t('students.add')}
              </Link>
            ) : null}
            {can('students.import') ? (
              <Link href="/admin/import" className="btn-secondary">
                {t('nav.import')}
              </Link>
            ) : null}
          </>
        }
      />

      <form
        className="card grid gap-3 sm:grid-cols-[1fr,12rem,10rem,auto] sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          setFilters((current) => ({ ...current, q: draft.trim(), page: 1 }));
        }}
      >
        <FormField
          type="search"
          label={t('students.search')}
          placeholder={t('students.searchHint')}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <SelectField
          label={t('students.class')}
          value={filters.sectionId}
          onChange={setFilter('sectionId')}
          placeholder={t('common.all')}
          options={sections.options}
        />
        <SelectField
          label={t('students.status')}
          value={filters.status}
          onChange={setFilter('status')}
          options={[
            ...STUDENT_STATUSES.map((status) => ({
              value: status,
              label: t(`students.statuses.${status}`),
            })),
            { value: 'all', label: t('common.all') },
          ]}
        />
        <button type="submit" className="btn-secondary">
          {t('common.search')}
        </button>
      </form>

      {students.phase === 'loading' ? <LoadingState /> : null}
      {students.phase === 'error' ? (
        <ErrorState message={apiErrorMessage(t, students.error)} onRetry={students.reload} />
      ) : null}
      {students.data ? (
        <>
          <ResponsiveTable
            caption={t('nav.students')}
            columns={columns}
            rows={students.data.data}
            emptyTitle={filters.q ? t('students.noMatches') : t('students.empty')}
          />
          <Pagination
            meta={students.data.meta}
            onPage={(page) => setFilters((current) => ({ ...current, page }))}
          />
        </>
      ) : null}
    </main>
  );
}
