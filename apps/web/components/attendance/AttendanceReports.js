'use client';

import { useState } from 'react';
import { useI18n } from '@/components/providers/I18nProvider';
import { ErrorState, LoadingState } from '@/components/ui/StateViews';
import { FormField, SelectField } from '@/components/ui/FormField';
import { Badge, PageHeader } from '@/components/ui/Page';
import ResponsiveTable from '@/components/ui/ResponsiveTable';
import { apiErrorMessage } from '@/lib/apiErrors';
import { downloadCsv } from '@/lib/csv';
import { useApiData } from '@/lib/useApiData';
import { useSectionOptions } from '@/lib/useSectionOptions';
import { STATUS_SHORT, STATUS_STYLES } from './statuses';

const percent = (value) => (value === null || value === undefined ? '—' : `${value}%`);

export default function AttendanceReports() {
  const { t } = useI18n();
  const [tab, setTab] = useState('daily');
  const [date, setDate] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [month, setMonth] = useState('');

  const openMonthly = (id) => {
    setSectionId(id);
    setTab('monthly');
  };

  return (
    <main className="flex flex-col gap-4 px-4 py-6">
      <PageHeader title={t('attendance.reportsTitle')} />
      <div className="flex gap-2" role="tablist">
        {['daily', 'monthly'].map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            className={tab === key ? 'btn-primary' : 'btn-secondary'}
            onClick={() => setTab(key)}
          >
            {t(`attendance.tabs.${key}`)}
          </button>
        ))}
      </div>
      {tab === 'daily' ? (
        <DailyReport date={date} setDate={setDate} onOpenSection={openMonthly} />
      ) : (
        <MonthlyReport
          sectionId={sectionId}
          setSectionId={setSectionId}
          month={month}
          setMonth={setMonth}
        />
      )}
    </main>
  );
}

function DailyReport({ date, setDate, onOpenSection }) {
  const { t } = useI18n();
  const report = useApiData(`/attendance/reports/daily${date ? `?date=${date}` : ''}`);
  const data = report.data;

  const columns = [
    {
      key: 'label',
      header: t('attendance.section'),
      primary: true,
      render: (row) => (
        <button
          type="button"
          className="font-semibold text-brand-700 hover:underline"
          onClick={() => onOpenSection(row.id)}
        >
          {row.label}
        </button>
      ),
    },
    {
      key: 'status',
      header: t('attendance.taken'),
      render: (row) =>
        row.sessionsMarked ? (
          <Badge tone="green">{t('attendance.takenYes')}</Badge>
        ) : (
          <Badge tone="amber">{t('attendance.takenNo')}</Badge>
        ),
    },
    { key: 'present', header: t('attendance.statuses.present') },
    { key: 'absent', header: t('attendance.statuses.absent') },
    {
      key: 'other',
      header: t('attendance.otherStatuses'),
      render: (row) => row.late + row.halfDay + row.onLeave,
    },
    { key: 'percentage', header: '%', render: (row) => percent(row.percentage) },
    {
      key: 'classTeacher',
      header: t('attendance.classTeacher'),
      render: (row) => row.classTeacher ?? '—',
    },
  ];

  return (
    <>
      <section className="card">
        <FormField
          type="date"
          label={t('attendance.date')}
          value={date || data?.date || ''}
          onChange={(e) => setDate(e.target.value)}
        />
      </section>
      {report.phase === 'loading' ? <LoadingState /> : null}
      {report.phase === 'error' ? (
        <ErrorState message={apiErrorMessage(t, report.error)} onRetry={report.reload} />
      ) : null}
      {data ? (
        <>
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat
              label={t('attendance.sectionsTaken')}
              value={`${data.totals.sectionsMarked} / ${data.totals.sections}`}
            />
            <Stat label={t('attendance.statuses.present')} value={data.totals.present} />
            <Stat label={t('attendance.statuses.absent')} value={data.totals.absent} />
            <Stat label={t('attendance.overall')} value={percent(data.totals.percentage)} />
          </section>
          <ResponsiveTable
            caption={t('attendance.tabs.daily')}
            columns={columns}
            rows={data.sections}
            emptyTitle={t('attendance.noSections')}
          />
        </>
      ) : null}
    </>
  );
}

function MonthlyReport({ sectionId, setSectionId, month, setMonth }) {
  const { t } = useI18n();
  const sections = useSectionOptions();
  const selected = sectionId || sections.options[0]?.value || '';
  const report = useApiData(
    selected
      ? `/attendance/reports/monthly?sectionId=${selected}${month ? `&month=${month}` : ''}`
      : null,
  );
  const [showRegister, setShowRegister] = useState(false);
  const data = report.data;

  const download = () =>
    downloadCsv(
      [
        [
          'roll_no',
          'name',
          ...data.sessions.map((s) =>
            s.session === 'full_day' ? s.date : `${s.date} ${s.session}`,
          ),
          'present',
          'absent',
          'percentage',
        ],
        ...data.students.map((s) => [
          s.rollNo ?? '',
          s.name,
          ...s.marks.map((mark) => (mark ? STATUS_SHORT[mark] : '')),
          s.summary.present + s.summary.late,
          s.summary.absent,
          s.summary.percentage ?? '',
        ]),
      ],
      `attendance-${data.section.label.replace(/\s+/g, '')}-${data.month}.csv`,
    );

  return (
    <>
      <section className="card grid gap-3 sm:grid-cols-2">
        <SelectField
          label={t('attendance.section')}
          value={selected}
          onChange={(e) => setSectionId(e.target.value)}
          options={sections.options}
        />
        <FormField
          type="month"
          label={t('attendance.month')}
          value={month || data?.month || ''}
          onChange={(e) => setMonth(e.target.value)}
        />
      </section>
      {report.phase === 'loading' ? <LoadingState /> : null}
      {report.phase === 'error' ? (
        <ErrorState message={apiErrorMessage(t, report.error)} onRetry={report.reload} />
      ) : null}
      {data ? (
        <>
          <section className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-slate-600">
              {t('attendance.monthSummary', {
                days: data.sessions.length,
                percentage: percent(data.totals.percentage),
              })}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                className="btn-secondary px-3"
                onClick={() => setShowRegister((v) => !v)}
              >
                {showRegister ? t('attendance.hideRegister') : t('attendance.showRegister')}
              </button>
              <button
                type="button"
                className="btn-secondary px-3"
                onClick={download}
                disabled={!data.students.length}
              >
                {t('attendance.downloadCsv')}
              </button>
            </div>
          </section>

          {showRegister ? (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
              <table className="text-xs">
                <caption className="sr-only">{t('attendance.register')}</caption>
                <thead>
                  <tr>
                    <th scope="col" className="sticky left-0 bg-white px-2 py-2 text-left">
                      {t('students.name')}
                    </th>
                    {data.sessions.map((s) => (
                      <th
                        key={`${s.date}-${s.session}`}
                        scope="col"
                        className="px-1 py-2 font-medium text-slate-500"
                      >
                        {Number(s.date.slice(8))}
                        {s.session !== 'full_day' ? s.session[0].toUpperCase() : ''}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.students.map((student) => (
                    <tr key={student.id} className="border-t border-slate-100">
                      <th
                        scope="row"
                        className="sticky left-0 whitespace-nowrap bg-white px-2 py-1 text-left font-medium"
                      >
                        {student.rollNo ? `${student.rollNo}. ` : ''}
                        {student.name}
                      </th>
                      {student.marks.map((mark, index) => (
                        <td key={index} className="px-0.5 py-1 text-center">
                          {mark ? (
                            <span
                              className={`inline-block min-w-6 rounded px-1 ${STATUS_STYLES[mark]}`}
                              title={t(`attendance.statuses.${mark}`)}
                            >
                              {STATUS_SHORT[mark]}
                            </span>
                          ) : (
                            '·'
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          <ResponsiveTable
            caption={t('attendance.tabs.monthly')}
            rows={data.students}
            emptyTitle={t('attendance.noStudents')}
            columns={[
              {
                key: 'name',
                header: t('students.name'),
                primary: true,
                render: (s) => `${s.rollNo ? `${s.rollNo}. ` : ''}${s.name}`,
              },
              {
                key: 'present',
                header: t('attendance.statuses.present'),
                render: (s) => s.summary.present + s.summary.late,
              },
              {
                key: 'absent',
                header: t('attendance.statuses.absent'),
                render: (s) => s.summary.absent,
              },
              {
                key: 'leave',
                header: t('attendance.statuses.on_leave'),
                render: (s) => s.summary.onLeave,
              },
              {
                key: 'percentage',
                header: '%',
                render: (s) => (
                  <span
                    className={
                      s.summary.percentage !== null && s.summary.percentage < 75
                        ? 'font-semibold text-red-700'
                        : ''
                    }
                  >
                    {percent(s.summary.percentage)}
                  </span>
                ),
              },
            ]}
          />
        </>
      ) : null}
    </>
  );
}

function Stat({ label, value }) {
  return (
    <div className="card flex flex-col gap-1 p-3">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <span className="text-lg font-semibold text-slate-900">{value}</span>
    </div>
  );
}
