'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/components/providers/I18nProvider';
import { useAuth } from '@/components/providers/AuthProvider';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/StateViews';
import { CheckboxField, FormField, SelectField } from '@/components/ui/FormField';
import { Notice, PageHeader } from '@/components/ui/Page';
import { apiFetch } from '@/lib/api';
import { apiErrorMessage } from '@/lib/apiErrors';
import { useApiData } from '@/lib/useApiData';
import { useLabels } from '@/lib/useLabels';

export default function SectionDetailPage({ sectionId }) {
  const { t } = useI18n();
  const { can } = useAuth();
  const labels = useLabels();
  const router = useRouter();
  const canManage = can('academics.manage');

  const detail = useApiData(`/sections/${sectionId}/subjects`);
  const subjects = useApiData('/subjects?limit=100');
  const teachers = useApiData(can('staff.view') ? '/staff?limit=100' : null);

  const [form, setForm] = useState(null);
  const [mapping, setMapping] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState({ tone: 'success', text: null });

  useEffect(() => {
    if (!detail.data) return;
    const { section, data } = detail.data;
    setForm({
      name: section.name,
      capacity: section.capacity ?? '',
      room: section.room ?? '',
      classTeacherStaffId: section.classTeacher?.id ?? '',
      isActive: section.isActive,
    });
    setMapping(Object.fromEntries(data.map((row) => [row.subject.id, row.teacher?.id ?? ''])));
  }, [detail.data]);

  async function act(work, successText) {
    setBusy(true);
    setNotice({ tone: 'success', text: null });
    try {
      const result = await work();
      setNotice({ tone: 'success', text: successText });
      return result ?? true;
    } catch (error) {
      setNotice({ tone: 'error', text: apiErrorMessage(t, error) });
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function saveSection(event) {
    event.preventDefault();
    const ok = await act(
      () =>
        apiFetch(`/sections/${sectionId}`, {
          method: 'PATCH',
          body: {
            name: form.name,
            capacity: form.capacity === '' ? null : Number(form.capacity),
            room: form.room || null,
            classTeacherStaffId: form.classTeacherStaffId || null,
            isActive: form.isActive,
          },
        }),
      t('common.saved'),
    );
    if (ok) detail.reload();
  }

  async function saveSubjects() {
    const items = Object.entries(mapping).map(([subjectId, teacherStaffId]) => ({
      subjectId,
      teacherStaffId: teacherStaffId || null,
    }));
    const ok = await act(
      () => apiFetch(`/sections/${sectionId}/subjects`, { method: 'PUT', body: { items } }),
      t('sectionDetail.subjectsSaved'),
    );
    if (ok) detail.reload();
  }

  async function deleteSection() {
    if (!window.confirm(t('sectionDetail.confirmDelete', { section: labels.section }))) return;
    const ok = await act(
      () => apiFetch(`/sections/${sectionId}`, { method: 'DELETE' }),
      t('common.deleted'),
    );
    if (ok) router.replace('/admin/classes');
  }

  const toggleSubject = (subjectId) =>
    setMapping((current) => {
      const next = { ...current };
      if (subjectId in next) delete next[subjectId];
      else next[subjectId] = '';
      return next;
    });

  if (detail.phase === 'loading' || (detail.data && (!form || !mapping))) {
    return (
      <main className="px-4 py-6">
        <LoadingState />
      </main>
    );
  }
  if (detail.phase === 'error') {
    return (
      <main className="flex flex-col gap-3 px-4 py-6">
        <ErrorState message={apiErrorMessage(t, detail.error)} onRetry={detail.reload} />
        <Link href="/admin/classes" className="btn-secondary self-start">
          {t('common.back')}
        </Link>
      </main>
    );
  }

  const { section } = detail.data;
  const teacherOptions = (teachers.data?.data ?? []).map((staff) => ({
    value: staff.id,
    label: staff.designation ? `${staff.name} · ${staff.designation}` : staff.name,
  }));
  // Keep already-assigned teachers selectable while the staff list loads on a slow network.
  for (const assigned of [section.classTeacher, ...detail.data.data.map((row) => row.teacher)]) {
    if (assigned && !teacherOptions.some((option) => option.value === assigned.id)) {
      teacherOptions.push({ value: assigned.id, label: assigned.name });
    }
  }
  const subjectList = subjects.data?.data ?? [];

  return (
    <main className="flex flex-col gap-4 px-4 py-6">
      <Link href="/admin/classes" className="text-sm font-medium text-brand-700">
        ← {t('classes.title', { level: labels.level, section: labels.section })}
      </Link>
      <PageHeader
        title={`${section.level.name} · ${labels.section} ${section.name}`}
        description={t('sectionDetail.description', {
          year: section.academicYear.name,
          students: section.studentCount,
        })}
      />
      <Notice tone={notice.tone}>{notice.text}</Notice>

      <form onSubmit={saveSection} className="card flex flex-col gap-3">
        <h2 className="font-semibold">{t('sectionDetail.details', { section: labels.section })}</h2>
        <div className="grid grid-cols-2 gap-3">
          <FormField
            label={t('sectionDetail.name')}
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            disabled={!canManage}
            required
          />
          <FormField
            label={t('sectionDetail.room')}
            value={form.room}
            onChange={(e) => setForm((f) => ({ ...f, room: e.target.value }))}
            disabled={!canManage}
          />
          <FormField
            type="number"
            inputMode="numeric"
            min={1}
            label={t('sections.capacity')}
            value={form.capacity}
            onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))}
            disabled={!canManage}
          />
          <SelectField
            label={t('sectionDetail.classTeacher')}
            value={form.classTeacherStaffId}
            onChange={(e) => setForm((f) => ({ ...f, classTeacherStaffId: e.target.value }))}
            placeholder={t('sectionDetail.noTeacher')}
            options={teacherOptions}
            disabled={!canManage}
          />
        </div>
        <CheckboxField
          label={t('sectionDetail.active')}
          checked={form.isActive}
          onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
          disabled={!canManage}
        />
        {canManage ? (
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? t('common.saving') : t('common.save')}
            </button>
            {section.studentCount === 0 ? (
              <button
                type="button"
                className="btn-secondary text-red-700"
                disabled={busy}
                onClick={deleteSection}
              >
                {t('common.delete')}
              </button>
            ) : null}
          </div>
        ) : null}
      </form>

      <section className="card flex flex-col gap-3" aria-labelledby="subjects-heading">
        <div>
          <h2 id="subjects-heading" className="font-semibold">
            {t('sectionDetail.subjectsTitle')}
          </h2>
          <p className="text-sm text-slate-600">{t('sectionDetail.subjectsHelp')}</p>
        </div>
        {subjects.phase === 'loading' ? <LoadingState /> : null}
        {subjects.data && !subjectList.length ? (
          <EmptyState
            title={t('subjects.empty')}
            action={
              <Link href="/admin/subjects" className="btn-secondary">
                {t('subjects.add')}
              </Link>
            }
          />
        ) : null}
        <ul className="flex flex-col divide-y divide-slate-100">
          {subjectList.map((subject) => {
            const taught = subject.id in mapping;
            return (
              <li
                key={subject.id}
                className="grid gap-2 py-2 sm:grid-cols-[1fr,16rem] sm:items-center"
              >
                <CheckboxField
                  label={`${subject.name} (${subject.code})`}
                  checked={taught}
                  onChange={() => toggleSubject(subject.id)}
                  disabled={!canManage}
                />
                {taught ? (
                  <SelectField
                    label={t('sectionDetail.teacherFor', { subject: subject.name })}
                    value={mapping[subject.id]}
                    onChange={(e) =>
                      setMapping((current) => ({ ...current, [subject.id]: e.target.value }))
                    }
                    placeholder={t('sectionDetail.noTeacher')}
                    options={teacherOptions}
                    disabled={!canManage}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
        {canManage && subjectList.length ? (
          <button
            type="button"
            className="btn-primary self-start"
            disabled={busy}
            onClick={saveSubjects}
          >
            {busy ? t('common.saving') : t('sectionDetail.saveSubjects')}
          </button>
        ) : null}
      </section>
    </main>
  );
}
