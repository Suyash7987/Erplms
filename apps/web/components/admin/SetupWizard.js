'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useI18n } from '@/components/providers/I18nProvider';
import { useAuth } from '@/components/providers/AuthProvider';
import { ErrorState, LoadingState } from '@/components/ui/StateViews';
import { CheckboxField, FormField, SelectField } from '@/components/ui/FormField';
import { Notice, PageHeader } from '@/components/ui/Page';
import { apiFetch } from '@/lib/api';
import { apiErrorMessage } from '@/lib/apiErrors';
import { BOARD_OPTIONS } from '@/lib/boards';
import { useAction } from '@/lib/useAction';
import { useApiData } from '@/lib/useApiData';
import { useLabels } from '@/lib/useLabels';

const STEPS = ['profile', 'academicYear', 'levels', 'sections', 'subjects', 'finish'];

const SUBJECT_PRESETS = [
  { code: 'ENG', name: 'English', checked: true },
  { code: 'HIN', name: 'Hindi', checked: true },
  { code: 'MATH', name: 'Mathematics', checked: true },
  { code: 'EVS', name: 'Environmental Studies', checked: true },
  { code: 'SCI', name: 'Science', checked: true },
  { code: 'SST', name: 'Social Science', checked: true },
  { code: 'COMP', name: 'Computer Science', checked: true },
  { code: 'SKT', name: 'Sanskrit', checked: false },
  { code: 'PE', name: 'Physical Education', checked: false },
  { code: 'ART', name: 'Art', checked: false },
];

/** Suggests the Indian school year (April to March) that contains today. */
function suggestedYear() {
  const now = new Date();
  const start = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return {
    name: `${start}-${String((start + 1) % 100).padStart(2, '0')}`,
    startDate: `${start}-04-01`,
    endDate: `${start + 1}-03-31`,
  };
}

export default function SetupWizard() {
  const { t } = useI18n();
  const status = useApiData('/institute/setup');
  const [step, setStep] = useState(null);

  useEffect(() => {
    if (status.data && step === null) {
      const firstOpen = STEPS.findIndex((key) => key !== 'finish' && !status.data.steps[key]);
      setStep(firstOpen === -1 ? STEPS.length - 1 : firstOpen);
    }
  }, [status.data, step]);

  if (status.phase === 'loading' || step === null) {
    return status.phase === 'error' ? (
      <main className="px-4 py-6">
        <ErrorState message={apiErrorMessage(t, status.error)} onRetry={status.reload} />
      </main>
    ) : (
      <main className="px-4 py-6">
        <LoadingState />
      </main>
    );
  }

  const data = status.data;
  const next = async () => {
    await status.reload();
    setStep((current) => Math.min(current + 1, STEPS.length - 1));
  };

  return (
    <main className="flex flex-col gap-4 px-4 py-6">
      <PageHeader title={t('setup.title')} description={t('setup.subtitle')} />

      <ol className="flex gap-1 overflow-x-auto pb-1" aria-label={t('setup.steps')}>
        {STEPS.map((key, index) => {
          const done = key === 'finish' ? data.completed : data.steps[key];
          const current = index === step;
          return (
            <li key={key} className="shrink-0">
              <button
                type="button"
                onClick={() => setStep(index)}
                aria-current={current ? 'step' : undefined}
                className={`inline-flex min-h-10 items-center gap-1 rounded-lg px-3 text-sm font-medium ${
                  current
                    ? 'bg-brand-600 text-white'
                    : done
                      ? 'bg-emerald-50 text-emerald-800'
                      : 'bg-white text-slate-600 ring-1 ring-slate-200'
                }`}
              >
                <span aria-hidden="true">{done ? '✓' : index + 1}</span>
                {t(`setup.step.${key}`)}
              </button>
            </li>
          );
        })}
      </ol>

      <section className="card flex flex-col gap-4">
        {STEPS[step] === 'profile' ? <ProfileStep status={data} onDone={next} /> : null}
        {STEPS[step] === 'academicYear' ? <YearStep status={data} onDone={next} /> : null}
        {STEPS[step] === 'levels' ? <LevelsStep status={data} onDone={next} /> : null}
        {STEPS[step] === 'sections' ? <SectionsStep status={data} onDone={next} /> : null}
        {STEPS[step] === 'subjects' ? <SubjectsStep status={data} onDone={next} /> : null}
        {STEPS[step] === 'finish' ? <FinishStep status={data} onDone={status.reload} /> : null}
      </section>
    </main>
  );
}

function StepTitle({ name }) {
  const { t } = useI18n();
  return (
    <div>
      <h2 className="text-lg font-semibold">{t(`setup.step.${name}`)}</h2>
      <p className="text-sm text-slate-600">{t(`setup.help.${name}`)}</p>
    </div>
  );
}

function ProfileStep({ status, onDone }) {
  const { t } = useI18n();
  const { reload } = useAuth();
  const institute = status.institute;
  const [values, setValues] = useState({
    name: institute.name,
    board: institute.board,
    boardName: institute.boardName ?? '',
    level: institute.settings?.labels?.level ?? t('labels.level'),
    section: institute.settings?.labels?.section ?? t('labels.section'),
  });
  const action = useAction();
  const set = (field) => (event) => setValues((v) => ({ ...v, [field]: event.target.value }));

  async function submit(event) {
    event.preventDefault();
    const result = await action.run(() =>
      apiFetch('/institute/setup/profile', {
        method: 'POST',
        body: {
          name: values.name,
          board: values.board,
          boardName: values.boardName || null,
          settings: { labels: { level: values.level, section: values.section } },
        },
      }),
    );
    if (result) {
      await reload();
      onDone();
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <StepTitle name="profile" />
      <Notice tone="error">{action.error}</Notice>
      <FormField label={t('settings.name')} value={values.name} onChange={set('name')} required />
      <SelectField
        label={t('settings.board')}
        value={values.board}
        onChange={set('board')}
        options={BOARD_OPTIONS}
      />
      <FormField
        label={t('settings.boardName')}
        hint={t('settings.boardNameHint')}
        value={values.boardName}
        onChange={set('boardName')}
      />
      <div className="grid grid-cols-2 gap-3">
        <FormField
          label={t('settings.levelLabel')}
          hint={t('settings.levelLabelHint')}
          value={values.level}
          onChange={set('level')}
          required
        />
        <FormField
          label={t('settings.sectionLabel')}
          value={values.section}
          onChange={set('section')}
          required
        />
      </div>
      <button type="submit" className="btn-primary self-start" disabled={action.busy}>
        {action.busy ? t('common.saving') : t('setup.saveContinue')}
      </button>
    </form>
  );
}

function YearStep({ status, onDone }) {
  const { t } = useI18n();
  const [values, setValues] = useState(suggestedYear);
  const action = useAction();
  const set = (field) => (event) => setValues((v) => ({ ...v, [field]: event.target.value }));

  if (status.currentAcademicYear) {
    const year = status.currentAcademicYear;
    return (
      <div className="flex flex-col gap-4">
        <StepTitle name="academicYear" />
        <Notice>{t('setup.yearReady', year)}</Notice>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-primary" onClick={onDone}>
            {t('setup.continue')}
          </button>
          <Link href="/admin/academic-years" className="btn-secondary">
            {t('setup.manageYears')}
          </Link>
        </div>
      </div>
    );
  }

  async function submit(event) {
    event.preventDefault();
    const result = await action.run(() =>
      apiFetch('/academic-years', { method: 'POST', body: { ...values, makeCurrent: true } }),
    );
    if (result) onDone();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <StepTitle name="academicYear" />
      <Notice tone="error">{action.error}</Notice>
      <FormField label={t('years.name')} value={values.name} onChange={set('name')} required />
      <div className="grid grid-cols-2 gap-3">
        <FormField
          type="date"
          label={t('years.startDate')}
          value={values.startDate}
          onChange={set('startDate')}
          required
        />
        <FormField
          type="date"
          label={t('years.endDate')}
          value={values.endDate}
          onChange={set('endDate')}
          required
        />
      </div>
      <button type="submit" className="btn-primary self-start" disabled={action.busy}>
        {action.busy ? t('common.saving') : t('setup.saveContinue')}
      </button>
    </form>
  );
}

function LevelsStep({ status, onDone }) {
  const { t } = useI18n();
  const labels = useLabels();
  const levels = useApiData('/levels?limit=100');
  const [range, setRange] = useState({ from: 1, to: 12 });
  const action = useAction();

  async function createRange() {
    const result = await action.run(() =>
      apiFetch('/levels/range', {
        method: 'POST',
        body: { from: Number(range.from), to: Number(range.to), prefix: labels.level },
      }),
    );
    if (result) levels.reload();
  }

  const list = levels.data?.data ?? [];
  return (
    <div className="flex flex-col gap-4">
      <StepTitle name="levels" />
      <Notice tone="error">{action.error}</Notice>
      <div className="grid grid-cols-2 gap-3">
        <FormField
          type="number"
          inputMode="numeric"
          min={0}
          max={20}
          label={t('setup.from')}
          value={range.from}
          onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
        />
        <FormField
          type="number"
          inputMode="numeric"
          min={0}
          max={20}
          label={t('setup.to')}
          value={range.to}
          onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
        />
      </div>
      <button
        type="button"
        className="btn-secondary self-start"
        onClick={createRange}
        disabled={action.busy}
      >
        {t('setup.createLevels', { level: labels.level, from: range.from, to: range.to })}
      </button>

      {levels.phase === 'loading' ? <LoadingState /> : null}
      {list.length ? (
        <ul className="flex flex-wrap gap-2" aria-label={t('setup.existing')}>
          {list.map((level) => (
            <li key={level.id} className="rounded-full bg-slate-100 px-3 py-1 text-sm">
              {level.name}
            </li>
          ))}
        </ul>
      ) : null}
      <p className="text-sm text-slate-600">{t('setup.levelsMore', { level: labels.level })}</p>
      <button
        type="button"
        className="btn-primary self-start"
        onClick={onDone}
        disabled={!list.length && !status.steps.levels}
      >
        {t('setup.continue')}
      </button>
    </div>
  );
}

function SectionsStep({ status, onDone }) {
  const { t } = useI18n();
  const labels = useLabels();
  const levels = useApiData('/levels?limit=100');
  const [names, setNames] = useState('A, B');
  const [capacity, setCapacity] = useState('40');
  const [excluded, setExcluded] = useState(() => new Set());
  const [result, setResult] = useState(null);
  const action = useAction();
  const year = status.currentAcademicYear;
  const list = levels.data?.data ?? [];

  if (!year) return <Notice tone="error">{t('setup.needYear')}</Notice>;

  async function create() {
    const levelIds = list.filter((level) => !excluded.has(level.id)).map((level) => level.id);
    const sectionNames = names
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean);
    const created = await action.run(() =>
      apiFetch('/sections/grid', {
        method: 'POST',
        body: {
          academicYearId: year.id,
          levelIds,
          names: sectionNames,
          capacity: capacity ? Number(capacity) : null,
        },
      }),
    );
    if (created) setResult(created);
  }

  const toggle = (id) =>
    setExcluded((current) => {
      const nextSet = new Set(current);
      if (nextSet.has(id)) nextSet.delete(id);
      else nextSet.add(id);
      return nextSet;
    });

  return (
    <div className="flex flex-col gap-4">
      <StepTitle name="sections" />
      <Notice tone="error">{action.error}</Notice>
      <Notice>{result ? t('setup.sectionsCreated', result) : null}</Notice>
      <div className="grid grid-cols-2 gap-3">
        <FormField
          label={t('setup.sectionNames', { section: labels.section })}
          hint={t('setup.sectionNamesHint')}
          value={names}
          onChange={(e) => setNames(e.target.value)}
        />
        <FormField
          type="number"
          inputMode="numeric"
          min={1}
          label={t('sections.capacity')}
          value={capacity}
          onChange={(e) => setCapacity(e.target.value)}
        />
      </div>
      {levels.phase === 'loading' ? <LoadingState /> : null}
      <fieldset className="grid grid-cols-2 gap-x-3 sm:grid-cols-3">
        <legend className="label">{t('setup.forLevels', { level: labels.level })}</legend>
        {list.map((level) => (
          <CheckboxField
            key={level.id}
            label={level.name}
            checked={!excluded.has(level.id)}
            onChange={() => toggle(level.id)}
          />
        ))}
      </fieldset>
      <button
        type="button"
        className="btn-secondary self-start"
        onClick={create}
        disabled={action.busy || !list.length}
      >
        {t('setup.createSections', { section: labels.section, year: year.name })}
      </button>
      <button
        type="button"
        className="btn-primary self-start"
        onClick={onDone}
        disabled={!result && !status.steps.sections}
      >
        {t('setup.continue')}
      </button>
    </div>
  );
}

function SubjectsStep({ status, onDone }) {
  const { t } = useI18n();
  const existing = useApiData('/subjects?limit=100&includeInactive=true');
  const [selected, setSelected] = useState(
    () => new Set(SUBJECT_PRESETS.filter((s) => s.checked).map((s) => s.code)),
  );
  const [custom, setCustom] = useState([]);
  const [draft, setDraft] = useState({ name: '', code: '' });
  const action = useAction();
  const existingCodes = new Set((existing.data?.data ?? []).map((s) => s.code));

  const toggle = (code) =>
    setSelected((current) => {
      const nextSet = new Set(current);
      if (nextSet.has(code)) nextSet.delete(code);
      else nextSet.add(code);
      return nextSet;
    });

  function addCustom() {
    const name = draft.name.trim();
    const code = draft.code.trim().toUpperCase();
    if (!name || !code) return;
    setCustom((list) => [...list, { name, code }]);
    setSelected((current) => new Set(current).add(code));
    setDraft({ name: '', code: '' });
  }

  async function save() {
    const subjects = [...SUBJECT_PRESETS, ...custom]
      .filter((s) => selected.has(s.code) && !existingCodes.has(s.code))
      .map(({ name, code }) => ({ name, code }));
    if (!subjects.length) {
      onDone();
      return;
    }
    const result = await action.run(() =>
      apiFetch('/subjects', { method: 'POST', body: { subjects } }),
    );
    if (result) onDone();
  }

  return (
    <div className="flex flex-col gap-4">
      <StepTitle name="subjects" />
      <Notice tone="error">{action.error}</Notice>
      {existing.phase === 'loading' ? <LoadingState /> : null}
      <fieldset className="grid gap-x-3 sm:grid-cols-2">
        <legend className="sr-only">{t('setup.step.subjects')}</legend>
        {[...SUBJECT_PRESETS, ...custom].map((subject) => (
          <CheckboxField
            key={subject.code}
            label={`${subject.name} (${subject.code})`}
            description={existingCodes.has(subject.code) ? t('setup.alreadyAdded') : undefined}
            checked={existingCodes.has(subject.code) || selected.has(subject.code)}
            disabled={existingCodes.has(subject.code)}
            onChange={() => toggle(subject.code)}
          />
        ))}
      </fieldset>
      <div className="grid grid-cols-[1fr,7rem,auto] items-end gap-2">
        <FormField
          label={t('subjects.name')}
          value={draft.name}
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
        />
        <FormField
          label={t('subjects.code')}
          value={draft.code}
          onChange={(e) => setDraft((d) => ({ ...d, code: e.target.value }))}
        />
        <button type="button" className="btn-secondary" onClick={addCustom}>
          {t('common.add')}
        </button>
      </div>
      <button
        type="button"
        className="btn-primary self-start"
        onClick={save}
        disabled={action.busy || (!selected.size && !status.steps.subjects)}
      >
        {action.busy ? t('common.saving') : t('setup.saveContinue')}
      </button>
    </div>
  );
}

function FinishStep({ status, onDone }) {
  const { t } = useI18n();
  const labels = useLabels();
  const action = useAction();
  const missing = Object.entries(status.steps).filter(([, done]) => !done);

  async function finish() {
    const result = await action.run(() =>
      apiFetch('/institute/setup/complete', { method: 'POST' }),
    );
    if (result) onDone();
  }

  return (
    <div className="flex flex-col gap-4">
      <StepTitle name="finish" />
      <Notice tone="error">{action.error}</Notice>
      <ul className="grid gap-1 text-sm">
        {Object.entries(status.steps).map(([key, done]) => (
          <li key={key} className={done ? 'text-emerald-700' : 'text-slate-500'}>
            <span aria-hidden="true">{done ? '✓ ' : '○ '}</span>
            {t(`setup.step.${key}`)}
          </li>
        ))}
      </ul>
      {status.completed ? (
        <>
          <Notice>{t('setup.completed')}</Notice>
          <p className="text-sm text-slate-600">
            {t('setup.nextSteps', { level: labels.level, section: labels.section })}
          </p>
          <Link href="/admin/classes" className="btn-primary self-start">
            {t('setup.goToClasses', { level: labels.level })}
          </Link>
        </>
      ) : (
        <button
          type="button"
          className="btn-primary self-start"
          onClick={finish}
          disabled={action.busy || missing.length > 0}
        >
          {t('setup.finish')}
        </button>
      )}
    </div>
  );
}
