'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useI18n } from '@/components/providers/I18nProvider';
import { useAuth } from '@/components/providers/AuthProvider';
import { ErrorState, LoadingState } from '@/components/ui/StateViews';
import { FormField, SelectField } from '@/components/ui/FormField';
import { Badge, Notice, PageHeader } from '@/components/ui/Page';
import CredentialsNotice from '@/components/admin/CredentialsNotice';
import { apiFetch } from '@/lib/api';
import { apiErrorMessage } from '@/lib/apiErrors';
import { useApiData } from '@/lib/useApiData';
import { STAFF_STATUS_TONE } from './StaffPage';

const toForm = (staff) => ({
  name: staff.name,
  designation: staff.designation ?? '',
  department: staff.department ?? '',
  staffType: staff.staffType,
  joiningDate: staff.joiningDate ?? '',
  status: staff.status,
});

export default function StaffProfile({ staffId }) {
  const { t } = useI18n();
  const { can } = useAuth();
  const profile = useApiData(`/staff/${staffId}`);
  const [staff, setStaff] = useState(null);
  const [form, setForm] = useState(null);
  const [credentials, setCredentials] = useState([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState({ tone: 'success', text: null });

  useEffect(() => {
    if (profile.data) {
      setStaff(profile.data);
      setForm(toForm(profile.data));
    }
  }, [profile.data]);

  if (profile.phase === 'loading' || (profile.data && !staff)) {
    return (
      <main className="px-4 py-6">
        <LoadingState />
      </main>
    );
  }
  if (profile.phase === 'error') {
    return (
      <main className="flex flex-col gap-3 px-4 py-6">
        <ErrorState message={apiErrorMessage(t, profile.error)} onRetry={profile.reload} />
        <Link href="/admin/staff" className="btn-secondary self-start">
          {t('common.back')}
        </Link>
      </main>
    );
  }

  const canUpdate = can('staff.update');
  const set = (field) => (event) => setForm((f) => ({ ...f, [field]: event.target.value }));

  async function save(event) {
    event.preventDefault();
    if (
      form.status !== staff.status &&
      form.status !== 'active' &&
      !window.confirm(t('staff.confirmLeave'))
    )
      return;
    setBusy(true);
    setNotice({ tone: 'success', text: null });
    try {
      const updated = await apiFetch(`/staff/${staffId}`, {
        method: 'PATCH',
        body: {
          name: form.name.trim(),
          designation: form.designation.trim() || null,
          department: form.department.trim() || null,
          staffType: form.staffType,
          joiningDate: form.joiningDate || null,
          status: form.status,
        },
      });
      setStaff(updated);
      setForm(toForm(updated));
      setNotice({ tone: 'success', text: t('common.saved') });
    } catch (error) {
      setNotice({ tone: 'error', text: apiErrorMessage(t, error) });
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword() {
    if (!window.confirm(t('staff.confirmReset', { name: staff.name }))) return;
    setBusy(true);
    setNotice({ tone: 'success', text: null });
    try {
      const result = await apiFetch(`/users/${staff.login.id}/reset-password`, { method: 'POST' });
      setCredentials([
        {
          name: staff.name,
          phone: staff.phone,
          role: staff.login.roles[0]?.code ?? 'teacher',
          temporaryPassword: result.temporaryPassword,
        },
      ]);
    } catch (error) {
      setNotice({ tone: 'error', text: apiErrorMessage(t, error) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex flex-col gap-4 px-4 py-6">
      <Link href="/admin/staff" className="text-sm font-medium text-brand-700">
        ← {t('nav.staff')}
      </Link>
      <PageHeader
        title={staff.name}
        description={[staff.employeeCode, staff.designation].filter(Boolean).join(' · ')}
        actions={
          <Badge tone={STAFF_STATUS_TONE[staff.status]}>
            {t(`staff.statuses.${staff.status}`)}
          </Badge>
        }
      />
      <Notice tone={notice.tone}>{notice.text}</Notice>
      <CredentialsNotice credentials={credentials} filename={`login-${staff.employeeCode}.csv`} />

      <form onSubmit={save} className="card grid gap-3 sm:grid-cols-2">
        <h2 className="font-semibold sm:col-span-2">{t('staff.details')}</h2>
        <fieldset className="contents" disabled={!canUpdate}>
          <FormField label={t('staff.name')} value={form.name} onChange={set('name')} required />
          <FormField
            label={t('staff.phone')}
            value={staff.phone}
            readOnly
            hint={t('staff.phoneLocked')}
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
          <SelectField
            label={t('staff.status')}
            hint={t('staff.statusHint')}
            value={form.status}
            onChange={set('status')}
            options={['active', 'inactive', 'left'].map((s) => ({
              value: s,
              label: t(`staff.statuses.${s}`),
            }))}
          />
        </fieldset>
        {canUpdate ? (
          <div className="sm:col-span-2">
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? t('common.saving') : t('common.save')}
            </button>
          </div>
        ) : null}
      </form>

      <section className="card flex flex-col gap-3">
        <h2 className="font-semibold">{t('staff.login')}</h2>
        {staff.login ? (
          <>
            <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-slate-500">{t('staff.loginStatus')}</dt>
              <dd>
                {staff.login.status === 'active' ? t('common.active') : t('staff.loginDisabled')}
              </dd>
              <dt className="text-slate-500">{t('staff.roles')}</dt>
              <dd>{staff.login.roles.map((role) => role.name).join(', ') || '—'}</dd>
              <dt className="text-slate-500">{t('staff.lastLogin')}</dt>
              <dd>
                {staff.login.lastLoginAt
                  ? new Date(staff.login.lastLoginAt).toLocaleString('en-IN')
                  : t('staff.never')}
              </dd>
            </dl>
            {can('users.reset_password') && staff.login.status === 'active' ? (
              <button
                type="button"
                className="btn-secondary self-start"
                disabled={busy}
                onClick={resetPassword}
              >
                {t('staff.resetPassword')}
              </button>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-slate-600">{t('staff.noLogin')}</p>
        )}
      </section>

      <section className="card flex flex-col gap-2">
        <h2 className="font-semibold">{t('staff.teaching')}</h2>
        {staff.classTeacherOf.length ? (
          <p className="text-sm">
            {t('staff.classTeacherOf')}:{' '}
            {staff.classTeacherOf.map((section) => (
              <Link
                key={section.id}
                href={`/admin/classes/${section.id}`}
                className="mr-2 text-brand-700"
              >
                {section.label}
              </Link>
            ))}
          </p>
        ) : null}
        {staff.teaches.length ? (
          <ul className="text-sm">
            {staff.teaches.map((row) => (
              <li key={`${row.sectionId}-${row.subject}`}>
                {row.subject} ·{' '}
                <Link href={`/admin/classes/${row.sectionId}`} className="text-brand-700">
                  {row.section}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">{t('staff.noSubjects')}</p>
        )}
      </section>
    </main>
  );
}
