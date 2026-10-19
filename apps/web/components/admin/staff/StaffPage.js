'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useI18n } from '@/components/providers/I18nProvider';
import { useAuth } from '@/components/providers/AuthProvider';
import { ErrorState, LoadingState } from '@/components/ui/StateViews';
import { FormField, SelectField } from '@/components/ui/FormField';
import { Badge, Notice, PageHeader } from '@/components/ui/Page';
import Pagination from '@/components/ui/Pagination';
import ResponsiveTable from '@/components/ui/ResponsiveTable';
import CredentialsNotice from '@/components/admin/CredentialsNotice';
import { apiFetch } from '@/lib/api';
import { apiErrorMessage } from '@/lib/apiErrors';
import { useAction } from '@/lib/useAction';
import { useApiData } from '@/lib/useApiData';

export const STAFF_STATUS_TONE = { active: 'green', inactive: 'amber', left: 'slate' };

const EMPTY = {
  employeeCode: '',
  name: '',
  phone: '',
  designation: '',
  department: '',
  staffType: 'teaching',
  joiningDate: '',
  roleCode: 'teacher',
};

const orUndefined = (value) => (value.trim() === '' ? undefined : value.trim());

export default function StaffPage() {
  const { t } = useI18n();
  const { can } = useAuth();
  const [draft, setDraft] = useState('');
  const [filters, setFilters] = useState({ q: '', staffType: '', status: 'active', page: 1 });
  const [form, setForm] = useState(null);
  const [created, setCreated] = useState(null);
  const action = useAction();
  const roles = useApiData(can('roles.view') ? '/roles?limit=100' : null);

  const params = new URLSearchParams({
    page: String(filters.page),
    limit: '20',
    status: filters.status,
  });
  if (filters.q) params.set('q', filters.q);
  if (filters.staffType) params.set('staffType', filters.staffType);
  const staff = useApiData(`/staff?${params}`);

  const roleOptions = (
    roles.data?.data ?? [{ code: 'teacher', name: t('credentials.roles.teacher') }]
  )
    .filter((role) => role.code !== 'parent' && role.code !== 'student')
    .map((role) => ({ value: role.code, label: role.name }));

  const set = (field) => (event) => setForm((f) => ({ ...f, [field]: event.target.value }));

  async function submit(event) {
    event.preventDefault();
    const result = await action.run(() =>
      apiFetch('/staff', {
        method: 'POST',
        body: {
          employeeCode: form.employeeCode.trim(),
          name: form.name.trim(),
          phone: form.phone.trim(),
          designation: orUndefined(form.designation),
          department: orUndefined(form.department),
          staffType: form.staffType,
          joiningDate: form.joiningDate || undefined,
          roleCodes: [form.roleCode],
        },
      }),
    );
    if (result) {
      setCreated(result);
      setForm(null);
      staff.reload();
    }
  }

  const columns = [
    {
      key: 'name',
      header: t('staff.name'),
      primary: true,
      render: (s) => (
        <Link
          href={`/admin/staff/${s.id}`}
          className="font-semibold text-brand-700 hover:underline"
        >
          {s.name}
        </Link>
      ),
    },
    { key: 'employeeCode', header: t('staff.employeeCode') },
    { key: 'designation', header: t('staff.designation'), render: (s) => s.designation ?? '—' },
    {
      key: 'phone',
      header: t('staff.phone'),
      render: (s) => (
        <a href={`tel:${s.phone}`} className="text-brand-700">
          {s.phone}
        </a>
      ),
    },
    {
      key: 'status',
      header: t('staff.status'),
      render: (s) => (
        <Badge tone={STAFF_STATUS_TONE[s.status]}>{t(`staff.statuses.${s.status}`)}</Badge>
      ),
    },
  ];

  return (
    <main className="flex flex-col gap-4 px-4 py-6">
      <PageHeader
        title={t('nav.staff')}
        description={t('staff.description')}
        actions={
          <>
            {can('staff.create') && !form ? (
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  setForm(EMPTY);
                  setCreated(null);
                }}
              >
                {t('staff.add')}
              </button>
            ) : null}
            {can('staff.import') ? (
              <Link href="/admin/import?type=staff" className="btn-secondary">
                {t('nav.import')}
              </Link>
            ) : null}
          </>
        }
      />

      {created ? (
        <>
          <Notice>{t('staff.added', { name: created.staff.name })}</Notice>
          <CredentialsNotice
            credentials={created.credentials}
            filename={`login-${created.staff.employeeCode}.csv`}
          />
        </>
      ) : null}

      {form ? (
        <form onSubmit={submit} className="card grid gap-3 sm:grid-cols-2">
          <h2 className="font-semibold sm:col-span-2">{t('staff.add')}</h2>
          <div className="sm:col-span-2">
            <Notice tone="error">{action.error}</Notice>
          </div>
          <FormField
            label={t('staff.employeeCode')}
            value={form.employeeCode}
            onChange={set('employeeCode')}
            required
          />
          <FormField label={t('staff.name')} value={form.name} onChange={set('name')} required />
          <FormField
            type="tel"
            inputMode="tel"
            label={t('staff.phone')}
            hint={t('staff.phoneHint')}
            value={form.phone}
            onChange={set('phone')}
            required
          />
          <SelectField
            label={t('staff.role')}
            value={form.roleCode}
            onChange={set('roleCode')}
            options={roleOptions}
          />
          <FormField
            label={t('staff.designation')}
            value={form.designation}
            onChange={set('designation')}
          />
          <FormField
            label={t('staff.department')}
            value={form.department}
            onChange={set('department')}
          />
          <SelectField
            label={t('staff.type')}
            value={form.staffType}
            onChange={set('staffType')}
            options={['teaching', 'non_teaching'].map((type) => ({
              value: type,
              label: t(`staff.types.${type}`),
            }))}
          />
          <FormField
            type="date"
            label={t('staff.joiningDate')}
            value={form.joiningDate}
            onChange={set('joiningDate')}
          />
          <div className="flex gap-2 sm:col-span-2">
            <button type="submit" className="btn-primary" disabled={action.busy}>
              {action.busy ? t('common.saving') : t('common.save')}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setForm(null)}>
              {t('common.cancel')}
            </button>
          </div>
        </form>
      ) : null}

      <form
        className="card grid gap-3 sm:grid-cols-[1fr,10rem,10rem,auto] sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          setFilters((current) => ({ ...current, q: draft.trim(), page: 1 }));
        }}
      >
        <FormField
          type="search"
          label={t('staff.search')}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <SelectField
          label={t('staff.type')}
          value={filters.staffType}
          onChange={(e) => setFilters((f) => ({ ...f, staffType: e.target.value, page: 1 }))}
          placeholder={t('common.all')}
          options={['teaching', 'non_teaching'].map((type) => ({
            value: type,
            label: t(`staff.types.${type}`),
          }))}
        />
        <SelectField
          label={t('staff.status')}
          value={filters.status}
          onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value, page: 1 }))}
          options={[
            ...['active', 'inactive', 'left'].map((s) => ({
              value: s,
              label: t(`staff.statuses.${s}`),
            })),
            { value: 'all', label: t('common.all') },
          ]}
        />
        <button type="submit" className="btn-secondary">
          {t('common.search')}
        </button>
      </form>

      {staff.phase === 'loading' ? <LoadingState /> : null}
      {staff.phase === 'error' ? (
        <ErrorState message={apiErrorMessage(t, staff.error)} onRetry={staff.reload} />
      ) : null}
      {staff.data ? (
        <>
          <ResponsiveTable
            caption={t('nav.staff')}
            columns={columns}
            rows={staff.data.data}
            emptyTitle={t('staff.empty')}
          />
          <Pagination
            meta={staff.data.meta}
            onPage={(page) => setFilters((f) => ({ ...f, page }))}
          />
        </>
      ) : null}
    </main>
  );
}
