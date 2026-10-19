'use client';

import { useId, useState } from 'react';
import { useI18n } from '@/components/providers/I18nProvider';

/** Labelled input with an accessible error and optional hint. */
export function FormField({ label, error, hint, type = 'text', ...inputProps }) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ');

  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      <input
        id={id}
        type={type}
        className="input"
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy || undefined}
        {...inputProps}
      />
      {hint ? (
        <p id={hintId} className="mt-1 text-xs text-slate-500">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="field-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Labelled native select (best on mobile). `options` = [{ value, label }]. */
export function SelectField({ label, error, hint, options, placeholder, ...selectProps }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      <select
        id={id}
        className="input"
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        {...selectProps}
      >
        {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {hint ? (
        <p id={`${id}-hint`} className="mt-1 text-xs text-slate-500">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="field-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Large tap-target checkbox with its label. */
export function CheckboxField({ label, description, ...inputProps }) {
  return (
    <label className="flex min-h-11 items-start gap-3 text-sm text-slate-800">
      <input
        type="checkbox"
        className="mt-0.5 h-5 w-5 shrink-0 rounded border-slate-300 text-brand-600"
        {...inputProps}
      />
      <span>
        <span className="font-medium">{label}</span>
        {description ? <span className="block text-slate-500">{description}</span> : null}
      </span>
    </label>
  );
}

/** Password input with a show/hide toggle (handy on small phone keyboards). */
export function PasswordField({ label, error, ...inputProps }) {
  const { t } = useI18n();
  const id = useId();
  const [visible, setVisible] = useState(false);

  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          className="input pr-20"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          {...inputProps}
        />
        <button
          type="button"
          onClick={() => setVisible((value) => !value)}
          className="absolute inset-y-0 right-0 min-w-16 rounded-r-xl px-3 text-sm font-medium text-brand-700"
          aria-pressed={visible}
        >
          {visible ? t('auth.hidePassword') : t('auth.showPassword')}
        </button>
      </div>
      {error ? (
        <p id={`${id}-error`} className="field-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
