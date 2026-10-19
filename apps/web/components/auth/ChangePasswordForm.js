'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/components/providers/I18nProvider';
import { useAuth, useRequireSession } from '@/components/providers/AuthProvider';
import { LoadingState } from '@/components/ui/StateViews';
import { apiFetch, ApiError } from '@/lib/api';
import { nextPathFor } from '@/lib/auth-routes';
import AuthCard from './AuthCard';
import { PasswordField } from '@/components/ui/FormField';
import SignOutButton from './SignOutButton';
import { authErrorMessage } from './authErrors';

// Mirrors the API's password rules (src/lib/validation.js) so users see progress as they type.
const RULES = [
  ['length', (value) => value.length >= 8 && value.length <= 64],
  ['lower', (value) => /[a-z]/.test(value)],
  ['upper', (value) => /[A-Z]/.test(value)],
  ['digit', (value) => /\d/.test(value)],
  ['symbol', (value) => /[^A-Za-z0-9]/.test(value)],
];

const SERVER_RULE_MESSAGES = {
  contains_phone: 'password.errors.containsPhone',
  same_as_current: 'password.errors.sameAsCurrent',
};

export default function ChangePasswordForm() {
  const { t } = useI18n();
  const { session, setSession } = useAuth();
  const router = useRouter();
  const ready = useRequireSession({ allowPending: true });
  const [values, setValues] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  if (!ready) return <LoadingState />;

  const results = RULES.map(([key, test]) => [key, test(values.newPassword)]);
  const matches = values.confirm.length > 0 && values.confirm === values.newPassword;
  const valid = results.every(([, ok]) => ok) && matches && values.currentPassword.length > 0;

  const update = (field) => (event) => {
    setValues((current) => ({ ...current, [field]: event.target.value }));
    setErrors({});
  };

  async function onSubmit(event) {
    event.preventDefault();
    if (!valid) return;
    setSubmitting(true);
    try {
      const next = await apiFetch('/auth/change-password', {
        method: 'POST',
        body: { currentPassword: values.currentPassword, newPassword: values.newPassword },
      });
      setSession(next);
      router.replace(nextPathFor(next, { afterLogin: true }));
    } catch (error) {
      setSubmitting(false);
      if (error instanceof ApiError && error.code === 'INVALID_CURRENT_PASSWORD') {
        setErrors({ currentPassword: t('password.errors.wrongCurrent') });
      } else if (error instanceof ApiError && error.code === 'VALIDATION_ERROR') {
        const detail = error.details?.find((d) => d.path === 'newPassword');
        setErrors({
          newPassword: t(SERVER_RULE_MESSAGES[detail?.code] ?? 'password.errors.invalid'),
        });
      } else {
        setErrors({ form: authErrorMessage(t, error) });
      }
    }
  }

  return (
    <AuthCard
      title={t('password.title')}
      subtitle={
        session.mustChangePassword ? t('password.subtitleRequired') : t('password.subtitle')
      }
      footer={
        <div className="flex justify-center">
          <SignOutButton className="btn-secondary" />
        </div>
      }
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {errors.form ? (
          <p role="alert" className="alert-error">
            {errors.form}
          </p>
        ) : null}
        <PasswordField
          label={t('password.current')}
          autoComplete="current-password"
          value={values.currentPassword}
          onChange={update('currentPassword')}
          error={errors.currentPassword}
        />
        <PasswordField
          label={t('password.new')}
          autoComplete="new-password"
          value={values.newPassword}
          onChange={update('newPassword')}
          error={errors.newPassword}
        />
        <PasswordField
          label={t('password.confirm')}
          autoComplete="new-password"
          value={values.confirm}
          onChange={update('confirm')}
        />

        <div aria-live="polite">
          <p className="mb-2 text-sm font-medium text-slate-700">{t('password.rulesTitle')}</p>
          <ul className="grid gap-1 text-sm">
            {[...results, ['match', matches]].map(([key, ok]) => (
              <li key={key} className={ok ? 'text-emerald-700' : 'text-slate-500'}>
                <span aria-hidden="true">{ok ? 'âœ“ ' : 'â—‹ '}</span>
                {t(`password.rules.${key}`)}
                <span className="sr-only">{ok ? ` (${t('password.ruleMet')})` : ''}</span>
              </li>
            ))}
          </ul>
        </div>

        <button type="submit" className="btn-primary w-full" disabled={!valid || submitting}>
          {submitting ? t('password.saving') : t('password.save')}
        </button>
      </form>
    </AuthCard>
  );
}
