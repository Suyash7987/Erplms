'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/components/providers/I18nProvider';
import { useAuth } from '@/components/providers/AuthProvider';
import { nextPathFor } from '@/lib/auth-routes';
import { ApiError } from '@/lib/api';
import AuthCard from './AuthCard';
import { FormField, PasswordField } from '@/components/ui/FormField';
import { authErrorMessage } from './authErrors';

// The institute code is remembered on the device so parents only type it once.
const INSTITUTE_CODE_KEY = 'erp.instituteCode';

export default function LoginForm() {
  const { t } = useI18n();
  const auth = useAuth();
  const router = useRouter();
  const [values, setValues] = useState({ instituteCode: '', phone: '', password: '' });
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(INSTITUTE_CODE_KEY);
    if (saved) setValues((current) => ({ ...current, instituteCode: saved }));
  }, []);

  // Already signed in (e.g. opened /login from a bookmark): continue where the session belongs.
  useEffect(() => {
    if (auth.status === 'signedIn' && !submitting) router.replace(nextPathFor(auth.session));
  }, [auth.status, auth.session, submitting, router]);

  const update = (field) => (event) => {
    setValues((current) => ({ ...current, [field]: event.target.value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
  };

  async function onSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setFormError(null);
    setFieldErrors({});
    try {
      const session = await auth.login(values);
      window.localStorage.setItem(INSTITUTE_CODE_KEY, values.instituteCode.trim().toLowerCase());
      router.replace(nextPathFor(session, { afterLogin: true }));
    } catch (error) {
      setSubmitting(false);
      if (error instanceof ApiError && error.code === 'VALIDATION_ERROR') {
        const invalid = Object.keys(error.fieldErrors);
        setFieldErrors(
          Object.fromEntries(invalid.map((field) => [field, t(`auth.invalid.${field}`)])),
        );
      } else {
        setFormError(authErrorMessage(t, error));
      }
    }
  }

  return (
    <AuthCard
      title={t('auth.signInTitle')}
      subtitle={t('auth.signInSubtitle')}
      footer={<p className="text-center text-sm text-slate-600">{t('auth.forgotPassword')}</p>}
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {formError ? (
          <p role="alert" className="alert-error">
            {formError}
          </p>
        ) : null}
        <FormField
          label={t('auth.instituteCode')}
          hint={t('auth.instituteCodeHint')}
          name="instituteCode"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          autoComplete="organization"
          required
          value={values.instituteCode}
          onChange={update('instituteCode')}
          error={fieldErrors.instituteCode}
        />
        <FormField
          label={t('auth.phone')}
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          required
          value={values.phone}
          onChange={update('phone')}
          error={fieldErrors.phone}
        />
        <PasswordField
          label={t('auth.password')}
          name="password"
          autoComplete="current-password"
          required
          value={values.password}
          onChange={update('password')}
          error={fieldErrors.password}
        />
        <button type="submit" className="btn-primary w-full" disabled={submitting}>
          {submitting ? t('auth.signingIn') : t('auth.signIn')}
        </button>
      </form>
    </AuthCard>
  );
}
