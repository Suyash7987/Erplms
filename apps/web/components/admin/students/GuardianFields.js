'use client';

import { useI18n } from '@/components/providers/I18nProvider';
import { FormField, SelectField } from '@/components/ui/FormField';

export const RELATIONS = ['father', 'mother', 'guardian', 'grandparent', 'sibling', 'other'];

export const emptyGuardian = (relation = 'father') => ({
  name: '',
  phone: '',
  relation,
  email: '',
});

/** Name, mobile, relation and email inputs for one guardian. */
export default function GuardianFields({ value, onChange, legend, errors = {} }) {
  const { t } = useI18n();
  const set = (field) => (event) => onChange({ ...value, [field]: event.target.value });

  return (
    <fieldset className="grid gap-3 sm:grid-cols-2">
      <legend className="mb-1 font-medium text-slate-800">{legend}</legend>
      <FormField
        label={t('guardians.name')}
        value={value.name}
        onChange={set('name')}
        required
        error={errors.name}
      />
      <FormField
        type="tel"
        inputMode="tel"
        label={t('guardians.phone')}
        hint={t('guardians.phoneHint')}
        value={value.phone}
        onChange={set('phone')}
        required
        error={errors.phone}
      />
      <SelectField
        label={t('guardians.relation')}
        value={value.relation}
        onChange={set('relation')}
        options={RELATIONS.map((relation) => ({
          value: relation,
          label: t(`guardians.relations.${relation}`),
        }))}
      />
      <FormField
        type="email"
        label={t('guardians.email')}
        value={value.email}
        onChange={set('email')}
      />
    </fieldset>
  );
}

/** Converts form values to the API shape (empty strings become absent). */
export function guardianPayload(value, extra = {}) {
  return {
    name: value.name.trim(),
    phone: value.phone.trim(),
    relation: value.relation,
    ...(value.email.trim() ? { email: value.email.trim() } : {}),
    ...extra,
  };
}
