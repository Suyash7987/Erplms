'use client';

import { useEffect, useState } from 'react';
import { useI18n } from '@/components/providers/I18nProvider';
import { useAuth } from '@/components/providers/AuthProvider';
import { ErrorState, LoadingState } from '@/components/ui/StateViews';
import { CheckboxField, FormField, SelectField } from '@/components/ui/FormField';
import { Notice, PageHeader } from '@/components/ui/Page';
import { apiFetch } from '@/lib/api';
import { apiErrorMessage } from '@/lib/apiErrors';
import { useApiData } from '@/lib/useApiData';
import { BOARD_OPTIONS } from '@/lib/boards';

const MODULES = ['attendance', 'leaves', 'timetable', 'notices', 'fees'];

function toForm(institute) {
  const settings = institute.settings ?? {};
  return {
    name: institute.name,
    board: institute.board,
    boardName: institute.boardName ?? '',
    phone: institute.phone ?? '',
    email: institute.email ?? '',
    addressLine: institute.addressLine ?? '',
    city: institute.city ?? '',
    state: institute.state ?? '',
    pincode: institute.pincode ?? '',
    levelLabel: settings.labels?.level ?? '',
    sectionLabel: settings.labels?.section ?? '',
    editWindowDays: settings.attendance?.editWindowDays ?? 2,
    sessionsPerDay: settings.attendance?.sessionsPerDay ?? 1,
    receiptPrefix: settings.fees?.receiptPrefix ?? '',
    modules: { ...institute.enabledModules },
  };
}

const orNull = (value) => (value === '' ? null : value);

export default function SettingsPage() {
  const { t } = useI18n();
  const { can, reload: reloadSession } = useAuth();
  const canManage = can('institute.manage');
  const institute = useApiData('/institute');
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState({ tone: 'success', text: null });

  useEffect(() => {
    if (institute.data) setForm(toForm(institute.data));
  }, [institute.data]);

  const set = (field) => (event) => setForm((f) => ({ ...f, [field]: event.target.value }));

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setNotice({ tone: 'success', text: null });
    try {
      await apiFetch('/institute', {
        method: 'PATCH',
        body: {
          name: form.name,
          board: form.board,
          boardName: orNull(form.boardName),
          phone: orNull(form.phone),
          email: orNull(form.email),
          addressLine: orNull(form.addressLine),
          city: orNull(form.city),
          state: orNull(form.state),
          pincode: orNull(form.pincode),
          settings: {
            labels: {
              ...(form.levelLabel ? { level: form.levelLabel } : {}),
              ...(form.sectionLabel ? { section: form.sectionLabel } : {}),
            },
            attendance: {
              editWindowDays: Number(form.editWindowDays),
              sessionsPerDay: Number(form.sessionsPerDay),
            },
            fees: { receiptPrefix: form.receiptPrefix },
          },
          enabledModules: form.modules,
        },
      });
      await Promise.all([institute.reload(), reloadSession()]);
      setNotice({ tone: 'success', text: t('common.saved') });
    } catch (error) {
      setNotice({ tone: 'error', text: apiErrorMessage(t, error) });
    } finally {
      setBusy(false);
    }
  }

  if (institute.phase === 'loading' || (institute.data && !form)) {
    return (
      <main className="px-4 py-6">
        <LoadingState />
      </main>
    );
  }
  if (institute.phase === 'error') {
    return (
      <main className="px-4 py-6">
        <ErrorState message={apiErrorMessage(t, institute.error)} onRetry={institute.reload} />
      </main>
    );
  }

  const disabled = !canManage;
  return (
    <main className="flex flex-col gap-4 px-4 py-6">
      <PageHeader
        title={t('nav.settings')}
        description={t('settings.description', { code: institute.data.slug })}
      />
      <Notice tone={notice.tone}>{notice.text}</Notice>

      <form onSubmit={save} className="flex flex-col gap-4">
        <fieldset className="card grid gap-3 sm:grid-cols-2" disabled={disabled}>
          <legend className="px-1 font-semibold">{t('settings.profile')}</legend>
          <div className="sm:col-span-2">
            <FormField
              label={t('settings.name')}
              value={form.name}
              onChange={set('name')}
              required
            />
          </div>
          <SelectField
            label={t('settings.board')}
            value={form.board}
            onChange={set('board')}
            options={BOARD_OPTIONS}
          />
          <FormField
            label={t('settings.boardName')}
            hint={t('settings.boardNameHint')}
            value={form.boardName}
            onChange={set('boardName')}
          />
          <FormField
            type="tel"
            inputMode="tel"
            label={t('settings.phone')}
            value={form.phone}
            onChange={set('phone')}
          />
          <FormField
            type="email"
            label={t('settings.email')}
            value={form.email}
            onChange={set('email')}
          />
          <div className="sm:col-span-2">
            <FormField
              label={t('settings.address')}
              value={form.addressLine}
              onChange={set('addressLine')}
            />
          </div>
          <FormField label={t('settings.city')} value={form.city} onChange={set('city')} />
          <FormField label={t('settings.state')} value={form.state} onChange={set('state')} />
          <FormField
            inputMode="numeric"
            label={t('settings.pincode')}
            value={form.pincode}
            onChange={set('pincode')}
          />
        </fieldset>

        <fieldset className="card grid gap-3 sm:grid-cols-2" disabled={disabled}>
          <legend className="px-1 font-semibold">{t('settings.labels')}</legend>
          <FormField
            label={t('settings.levelLabel')}
            hint={t('settings.levelLabelHint')}
            placeholder={t('labels.level')}
            value={form.levelLabel}
            onChange={set('levelLabel')}
          />
          <FormField
            label={t('settings.sectionLabel')}
            placeholder={t('labels.section')}
            value={form.sectionLabel}
            onChange={set('sectionLabel')}
          />
        </fieldset>

        <fieldset className="card grid gap-3 sm:grid-cols-2" disabled={disabled}>
          <legend className="px-1 font-semibold">{t('settings.attendance')}</legend>
          <FormField
            type="number"
            inputMode="numeric"
            min={0}
            max={30}
            label={t('settings.editWindowDays')}
            hint={t('settings.editWindowHint')}
            value={form.editWindowDays}
            onChange={set('editWindowDays')}
          />
          <SelectField
            label={t('settings.sessionsPerDay')}
            value={String(form.sessionsPerDay)}
            onChange={set('sessionsPerDay')}
            options={[
              { value: '1', label: t('settings.onceADay') },
              { value: '2', label: t('settings.twiceADay') },
            ]}
          />
          <FormField
            label={t('settings.receiptPrefix')}
            hint={t('settings.receiptPrefixHint')}
            value={form.receiptPrefix}
            onChange={set('receiptPrefix')}
          />
        </fieldset>

        <fieldset className="card flex flex-col gap-1" disabled={disabled}>
          <legend className="px-1 font-semibold">{t('settings.modules')}</legend>
          <p className="mb-2 text-sm text-slate-600">{t('settings.modulesHelp')}</p>
          {MODULES.map((module) => (
            <CheckboxField
              key={module}
              label={t(`modules.${module}`)}
              checked={Boolean(form.modules[module])}
              onChange={(e) =>
                setForm((f) => ({ ...f, modules: { ...f.modules, [module]: e.target.checked } }))
              }
            />
          ))}
        </fieldset>

        {canManage ? (
          <button type="submit" className="btn-primary self-start" disabled={busy}>
            {busy ? t('common.saving') : t('common.save')}
          </button>
        ) : null}
      </form>
    </main>
  );
}
