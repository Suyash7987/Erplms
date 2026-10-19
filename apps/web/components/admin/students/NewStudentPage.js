'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useI18n } from '@/components/providers/I18nProvider';
import { CheckboxField, FormField, SelectField } from '@/components/ui/FormField';
import { Notice, PageHeader } from '@/components/ui/Page';
import CredentialsNotice from '@/components/admin/CredentialsNotice';
import { apiFetch } from '@/lib/api';
import { useAction } from '@/lib/useAction';
import { useSectionOptions } from '@/lib/useSectionOptions';
import GuardianFields, { emptyGuardian, guardianPayload } from './GuardianFields';

const EMPTY = {
  admissionNo: '',
  firstName: '',
  lastName: '',
  gender: '',
  dateOfBirth: '',
  sectionId: '',
  rollNo: '',
  admissionDate: '',
  bloodGroup: '',
  address: '',
  studentPhone: '',
};

const orUndefined = (value) => (value === '' ? undefined : value);

export default function NewStudentPage() {
  const { t } = useI18n();
  const sections = useSectionOptions();
  const [values, setValues] = useState(EMPTY);
  const [guardian, setGuardian] = useState(emptyGuardian('father'));
  const [secondGuardian, setSecondGuardian] = useState(null);
  const [ownLogin, setOwnLogin] = useState(false);
  const [created, setCreated] = useState(null);
  const action = useAction();
  const set = (field) => (event) => setValues((v) => ({ ...v, [field]: event.target.value }));

  async function submit(event) {
    event.preventDefault();
    const result = await action.run(() =>
      apiFetch('/students', {
        method: 'POST',
        body: {
          admissionNo: values.admissionNo.trim(),
          firstName: values.firstName.trim(),
          lastName: orUndefined(values.lastName.trim()),
          gender: orUndefined(values.gender),
          dateOfBirth: orUndefined(values.dateOfBirth),
          admissionDate: orUndefined(values.admissionDate),
          bloodGroup: orUndefined(values.bloodGroup.trim()),
          address: orUndefined(values.address.trim()),
          sectionId: orUndefined(values.sectionId),
          rollNo: values.rollNo ? Number(values.rollNo) : undefined,
          studentPhone: ownLogin ? orUndefined(values.studentPhone.trim()) : undefined,
          guardians: [
            guardianPayload(guardian, { isPrimary: true, isFeePayer: true }),
            ...(secondGuardian ? [guardianPayload(secondGuardian)] : []),
          ],
        },
      }),
    );
    if (result) setCreated(result);
  }

  if (created) {
    return (
      <main className="flex flex-col gap-4 px-4 py-6">
        <PageHeader title={t('students.added', { name: created.student.name })} />
        <CredentialsNotice
          credentials={created.credentials}
          filename={`logins-${created.student.admissionNo}.csv`}
        />
        {created.student.siblings.length ? (
          <Notice>
            {t('students.siblingLinked', {
              names: created.student.siblings.map((s) => s.name).join(', '),
            })}
          </Notice>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Link href={`/admin/students/${created.student.id}`} className="btn-primary">
            {t('students.openProfile')}
          </Link>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setCreated(null);
              setValues(EMPTY);
              setGuardian(emptyGuardian('father'));
              setSecondGuardian(null);
              setOwnLogin(false);
            }}
          >
            {t('students.addAnother')}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex flex-col gap-4 px-4 py-6">
      <Link href="/admin/students" className="text-sm font-medium text-brand-700">
        ← {t('nav.students')}
      </Link>
      <PageHeader title={t('students.add')} description={t('students.addHelp')} />
      <Notice tone="error">{action.error}</Notice>

      <form onSubmit={submit} className="flex flex-col gap-4">
        <section className="card grid gap-3 sm:grid-cols-2">
          <h2 className="font-semibold sm:col-span-2">{t('students.details')}</h2>
          <FormField
            label={t('students.admissionNo')}
            value={values.admissionNo}
            onChange={set('admissionNo')}
            required
          />
          <SelectField
            label={t('students.class')}
            value={values.sectionId}
            onChange={set('sectionId')}
            placeholder={t('students.noSection')}
            options={sections.options}
          />
          <FormField
            label={t('students.firstName')}
            value={values.firstName}
            onChange={set('firstName')}
            required
          />
          <FormField
            label={t('students.lastName')}
            value={values.lastName}
            onChange={set('lastName')}
          />
          <SelectField
            label={t('students.gender')}
            value={values.gender}
            onChange={set('gender')}
            placeholder={t('common.notSet')}
            options={['male', 'female', 'other'].map((g) => ({
              value: g,
              label: t(`students.genders.${g}`),
            }))}
          />
          <FormField
            type="date"
            label={t('students.dateOfBirth')}
            value={values.dateOfBirth}
            onChange={set('dateOfBirth')}
          />
          <FormField
            type="number"
            inputMode="numeric"
            min={1}
            label={t('students.rollNo')}
            value={values.rollNo}
            onChange={set('rollNo')}
          />
          <FormField
            type="date"
            label={t('students.admissionDate')}
            value={values.admissionDate}
            onChange={set('admissionDate')}
          />
          <FormField
            label={t('students.bloodGroup')}
            placeholder="B+"
            value={values.bloodGroup}
            onChange={set('bloodGroup')}
          />
          <FormField
            label={t('students.address')}
            value={values.address}
            onChange={set('address')}
          />
        </section>

        <section className="card flex flex-col gap-4">
          <GuardianFields
            legend={t('students.primaryGuardian')}
            value={guardian}
            onChange={setGuardian}
          />
          {secondGuardian ? (
            <>
              <GuardianFields
                legend={t('students.secondGuardian')}
                value={secondGuardian}
                onChange={setSecondGuardian}
              />
              <button
                type="button"
                className="btn-secondary self-start"
                onClick={() => setSecondGuardian(null)}
              >
                {t('students.removeSecondGuardian')}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn-secondary self-start"
              onClick={() => setSecondGuardian(emptyGuardian('mother'))}
            >
              {t('students.addSecondGuardian')}
            </button>
          )}
          <p className="text-sm text-slate-600">{t('students.siblingHint')}</p>
        </section>

        <section className="card flex flex-col gap-3">
          <CheckboxField
            label={t('students.ownLogin')}
            description={t('students.ownLoginHint')}
            checked={ownLogin}
            onChange={(event) => setOwnLogin(event.target.checked)}
          />
          {ownLogin ? (
            <FormField
              type="tel"
              inputMode="tel"
              label={t('students.studentPhone')}
              value={values.studentPhone}
              onChange={set('studentPhone')}
              required
            />
          ) : null}
        </section>

        <button type="submit" className="btn-primary self-start" disabled={action.busy}>
          {action.busy ? t('common.saving') : t('students.save')}
        </button>
      </form>
    </main>
  );
}
