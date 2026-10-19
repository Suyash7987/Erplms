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
import { useSectionOptions } from '@/lib/useSectionOptions';
import GuardianFields, { emptyGuardian, guardianPayload } from './GuardianFields';
import { STATUS_TONE, STUDENT_STATUSES } from './StudentsPage';

const DETAIL_FIELDS = [
  'admissionNo',
  'firstName',
  'lastName',
  'gender',
  'dateOfBirth',
  'admissionDate',
  'bloodGroup',
  'address',
];

const toForm = (student) =>
  Object.fromEntries(DETAIL_FIELDS.map((field) => [field, student[field] ?? '']));

export default function StudentProfile({ studentId }) {
  const { t } = useI18n();
  const { can } = useAuth();
  const profile = useApiData(`/students/${studentId}`);
  const sections = useSectionOptions();
  const [student, setStudent] = useState(null);
  const [editing, setEditing] = useState(null);
  const [placement, setPlacement] = useState({ sectionId: '', rollNo: '' });
  const [newGuardian, setNewGuardian] = useState(null);
  const [statusForm, setStatusForm] = useState({ status: 'active', reason: '' });
  const [credentials, setCredentials] = useState([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState({ tone: 'success', text: null });

  useEffect(() => {
    if (profile.data) setStudent(profile.data);
  }, [profile.data]);

  useEffect(() => {
    if (!student) return;
    const current = student.enrollments.find((e) => e.academicYear.status === 'current');
    setPlacement({ sectionId: current?.section.id ?? '', rollNo: current?.rollNo ?? '' });
    setStatusForm({ status: student.status, reason: student.statusReason ?? '' });
  }, [student]);

  async function act(work, successKey) {
    setBusy(true);
    setNotice({ tone: 'success', text: null });
    try {
      const result = await work();
      setStudent(result.student ?? result);
      if (result.credentials?.length) setCredentials(result.credentials);
      setNotice({ tone: 'success', text: t(successKey) });
      return true;
    } catch (error) {
      setNotice({ tone: 'error', text: apiErrorMessage(t, error) });
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (profile.phase === 'loading' || (profile.data && !student)) {
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
        <Link href="/admin/students" className="btn-secondary self-start">
          {t('common.back')}
        </Link>
      </main>
    );
  }

  const canUpdate = can('students.update');
  const canManageGuardians = canUpdate && can('guardians.manage');
  const current = student.enrollments.find((e) => e.academicYear.status === 'current');
  const base = `/students/${studentId}`;

  const saveDetails = async (event) => {
    event.preventDefault();
    const body = Object.fromEntries(
      DETAIL_FIELDS.map((field) => [field, editing[field] === '' ? null : editing[field]]),
    );
    body.admissionNo = editing.admissionNo;
    body.firstName = editing.firstName;
    if (await act(() => apiFetch(base, { method: 'PATCH', body }), 'common.saved'))
      setEditing(null);
  };

  const savePlacement = (event) => {
    event.preventDefault();
    act(
      () =>
        apiFetch(`${base}/enrollment`, {
          method: 'PUT',
          body: {
            sectionId: placement.sectionId,
            rollNo: placement.rollNo ? Number(placement.rollNo) : null,
          },
        }),
      'common.saved',
    );
  };

  const updateLink = (guardianId, changes) =>
    act(
      () => apiFetch(`${base}/guardians/${guardianId}`, { method: 'PATCH', body: changes }),
      'common.saved',
    );

  const unlink = (guardian) => {
    if (!window.confirm(t('students.confirmUnlink', { name: guardian.name }))) return;
    act(() => apiFetch(`${base}/guardians/${guardian.id}`, { method: 'DELETE' }), 'common.saved');
  };

  const addGuardian = async (event) => {
    event.preventDefault();
    const ok = await act(
      () => apiFetch(`${base}/guardians`, { method: 'POST', body: guardianPayload(newGuardian) }),
      'students.guardianAdded',
    );
    if (ok) setNewGuardian(null);
  };

  const saveStatus = (event) => {
    event.preventDefault();
    act(
      () =>
        apiFetch(`${base}/status`, {
          method: 'POST',
          body: {
            status: statusForm.status,
            ...(statusForm.reason ? { reason: statusForm.reason } : {}),
          },
        }),
      'common.saved',
    );
  };

  return (
    <main className="flex flex-col gap-4 px-4 py-6">
      <Link href="/admin/students" className="text-sm font-medium text-brand-700">
        ← {t('nav.students')}
      </Link>
      <PageHeader
        title={student.name}
        description={[
          `${t('students.admissionNo')}: ${student.admissionNo}`,
          current
            ? `${current.section.level.name} - ${current.section.name}`
            : t('students.noSection'),
        ].join(' · ')}
        actions={
          <Badge tone={STATUS_TONE[student.status]}>
            {t(`students.statuses.${student.status}`)}
          </Badge>
        }
      />
      <Notice tone={notice.tone}>{notice.text}</Notice>
      <CredentialsNotice credentials={credentials} />

      {/* Details */}
      <section className="card flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold">{t('students.details')}</h2>
          {canUpdate && !editing ? (
            <button
              type="button"
              className="btn-secondary px-3"
              onClick={() => setEditing(toForm(student))}
            >
              {t('common.edit')}
            </button>
          ) : null}
        </div>
        {editing ? (
          <form onSubmit={saveDetails} className="grid gap-3 sm:grid-cols-2">
            {[
              ['admissionNo', 'text'],
              ['firstName', 'text'],
              ['lastName', 'text'],
              ['dateOfBirth', 'date'],
              ['admissionDate', 'date'],
              ['bloodGroup', 'text'],
              ['address', 'text'],
            ].map(([field, type]) => (
              <FormField
                key={field}
                type={type}
                label={t(`students.${field}`)}
                value={editing[field]}
                onChange={(e) => setEditing((v) => ({ ...v, [field]: e.target.value }))}
                required={field === 'admissionNo' || field === 'firstName'}
              />
            ))}
            <SelectField
              label={t('students.gender')}
              value={editing.gender}
              onChange={(e) => setEditing((v) => ({ ...v, gender: e.target.value }))}
              placeholder={t('common.notSet')}
              options={['male', 'female', 'other'].map((g) => ({
                value: g,
                label: t(`students.genders.${g}`),
              }))}
            />
            <div className="flex gap-2 sm:col-span-2">
              <button type="submit" className="btn-primary" disabled={busy}>
                {t('common.save')}
              </button>
              <button type="button" className="btn-secondary" onClick={() => setEditing(null)}>
                {t('common.cancel')}
              </button>
            </div>
          </form>
        ) : (
          <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1 text-sm">
            {[
              ['gender', student.gender ? t(`students.genders.${student.gender}`) : null],
              ['dateOfBirth', student.dateOfBirth],
              ['admissionDate', student.admissionDate],
              ['bloodGroup', student.bloodGroup],
              ['address', student.address],
            ].map(([field, value]) => (
              <div key={field} className="contents">
                <dt className="text-slate-500">{t(`students.${field}`)}</dt>
                <dd className="text-slate-800">{value || '—'}</dd>
              </div>
            ))}
            <dt className="text-slate-500">{t('students.ownLogin')}</dt>
            <dd className="text-slate-800">
              {student.login ? student.login.phone : t('common.no')}
            </dd>
          </dl>
        )}
      </section>

      {/* Placement in the current academic year */}
      {canUpdate ? (
        <form
          onSubmit={savePlacement}
          className="card grid gap-3 sm:grid-cols-[1fr,8rem,auto] sm:items-end"
        >
          <h2 className="font-semibold sm:col-span-3">{t('students.placement')}</h2>
          <SelectField
            label={t('students.class')}
            value={placement.sectionId}
            onChange={(e) => setPlacement((p) => ({ ...p, sectionId: e.target.value }))}
            placeholder={t('students.noSection')}
            options={sections.options}
            required
          />
          <FormField
            type="number"
            inputMode="numeric"
            min={1}
            label={t('students.rollNo')}
            value={placement.rollNo}
            onChange={(e) => setPlacement((p) => ({ ...p, rollNo: e.target.value }))}
          />
          <button type="submit" className="btn-secondary" disabled={busy || !placement.sectionId}>
            {t('common.save')}
          </button>
        </form>
      ) : null}

      {/* Guardians */}
      <section className="card flex flex-col gap-3">
        <h2 className="font-semibold">{t('students.guardians')}</h2>
        <ul className="flex flex-col divide-y divide-slate-100">
          {student.guardians.map((guardian) => (
            <li key={guardian.id} className="flex flex-col gap-2 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{guardian.name}</span>
                <span className="text-sm text-slate-600">
                  {t(`guardians.relations.${guardian.relation}`)}
                </span>
                {guardian.isPrimary ? <Badge tone="brand">{t('guardians.primary')}</Badge> : null}
                {guardian.isFeePayer ? <Badge>{t('guardians.feePayer')}</Badge> : null}
                {guardian.hasLogin ? <Badge tone="green">{t('guardians.hasLogin')}</Badge> : null}
                <Badge tone={guardian.consentGivenAt ? 'green' : 'amber'}>
                  {guardian.consentGivenAt
                    ? t('guardians.consentGiven')
                    : t('guardians.consentPending')}
                </Badge>
              </div>
              <a href={`tel:${guardian.phone}`} className="text-sm text-brand-700">
                {guardian.phone}
              </a>
              {canManageGuardians ? (
                <div className="flex flex-wrap gap-2">
                  {!guardian.isPrimary ? (
                    <button
                      type="button"
                      className="btn-secondary px-3"
                      disabled={busy}
                      onClick={() => updateLink(guardian.id, { isPrimary: true })}
                    >
                      {t('guardians.makePrimary')}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="btn-secondary px-3"
                    disabled={busy}
                    onClick={() => updateLink(guardian.id, { isFeePayer: !guardian.isFeePayer })}
                  >
                    {guardian.isFeePayer ? t('guardians.notFeePayer') : t('guardians.makeFeePayer')}
                  </button>
                  {student.guardians.length > 1 ? (
                    <button
                      type="button"
                      className="btn-secondary px-3 text-red-700"
                      disabled={busy}
                      onClick={() => unlink(guardian)}
                    >
                      {t('guardians.unlink')}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
        {canManageGuardians && newGuardian ? (
          <form
            onSubmit={addGuardian}
            className="flex flex-col gap-3 border-t border-slate-100 pt-3"
          >
            <GuardianFields
              legend={t('students.addGuardian')}
              value={newGuardian}
              onChange={setNewGuardian}
            />
            <p className="text-sm text-slate-600">{t('students.siblingHint')}</p>
            <div className="flex gap-2">
              <button type="submit" className="btn-primary" disabled={busy}>
                {t('common.add')}
              </button>
              <button type="button" className="btn-secondary" onClick={() => setNewGuardian(null)}>
                {t('common.cancel')}
              </button>
            </div>
          </form>
        ) : null}
        {canManageGuardians && !newGuardian ? (
          <button
            type="button"
            className="btn-secondary self-start"
            onClick={() => setNewGuardian(emptyGuardian('mother'))}
          >
            {t('students.addGuardian')}
          </button>
        ) : null}
      </section>

      {/* Siblings */}
      {student.siblings.length ? (
        <section className="card flex flex-col gap-2">
          <h2 className="font-semibold">{t('students.siblings')}</h2>
          <ul className="flex flex-wrap gap-2">
            {student.siblings.map((sibling) => (
              <li key={sibling.id}>
                <Link href={`/admin/students/${sibling.id}`} className="btn-secondary px-3">
                  {sibling.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Status (soft delete) */}
      {can('students.archive') ? (
        <form
          onSubmit={saveStatus}
          className="card grid gap-3 sm:grid-cols-[12rem,1fr,auto] sm:items-end"
        >
          <div className="sm:col-span-3">
            <h2 className="font-semibold">{t('students.statusTitle')}</h2>
            <p className="text-sm text-slate-600">{t('students.statusHelp')}</p>
          </div>
          <SelectField
            label={t('students.status')}
            value={statusForm.status}
            onChange={(e) => setStatusForm((s) => ({ ...s, status: e.target.value }))}
            options={STUDENT_STATUSES.map((status) => ({
              value: status,
              label: t(`students.statuses.${status}`),
            }))}
          />
          <FormField
            label={t('students.statusReason')}
            value={statusForm.reason}
            onChange={(e) => setStatusForm((s) => ({ ...s, reason: e.target.value }))}
          />
          <button
            type="submit"
            className="btn-secondary"
            disabled={busy || statusForm.status === student.status}
          >
            {t('common.save')}
          </button>
        </form>
      ) : null}

      {/* Enrollment history */}
      <section className="card flex flex-col gap-2">
        <h2 className="font-semibold">{t('students.history')}</h2>
        <ul className="flex flex-col gap-1 text-sm">
          {student.enrollments.map((enrollment) => (
            <li key={enrollment.id} className="flex flex-wrap gap-2">
              <span className="font-medium">{enrollment.academicYear.name}</span>
              <span>
                {enrollment.section.level.name} - {enrollment.section.name}
                {enrollment.rollNo ? ` · ${t('students.rollNo')} ${enrollment.rollNo}` : ''}
              </span>
              <Badge>{t(`students.enrollmentStatuses.${enrollment.status}`)}</Badge>
            </li>
          ))}
          {!student.enrollments.length ? (
            <li className="text-slate-500">{t('students.noHistory')}</li>
          ) : null}
        </ul>
      </section>
    </main>
  );
}
