'use client';

import { EmptyState } from '@/components/ui/StateViews';

/**
 * A table on tablets and desktops that collapses into one card per row on phones.
 *
 * columns: [{ key, header, render?(row), primary?: true, actions?: true, className? }]
 * - `primary` columns become the card title; `actions` columns render at the bottom of the card.
 */
export default function ResponsiveTable({ columns, rows, rowKey = 'id', caption, emptyTitle }) {
  if (!rows.length) return <EmptyState title={emptyTitle} />;

  const cell = (column, row) => (column.render ? column.render(row) : row[column.key]);
  const primary = columns.filter((column) => column.primary);
  const details = columns.filter((column) => !column.primary && !column.actions);
  const actions = columns.filter((column) => column.actions);

  return (
    <>
      <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white md:block">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              {columns.map((column) => (
                <th key={column.key} scope="col" className="px-4 py-3 font-semibold">
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr key={row[rowKey]}>
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={`px-4 py-3 align-middle ${column.className ?? ''}`}
                  >
                    {cell(column, row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="flex flex-col gap-3 md:hidden" aria-label={caption}>
        {rows.map((row) => (
          <li key={row[rowKey]} className="card flex flex-col gap-2">
            {primary.map((column) => (
              <div key={column.key} className="font-semibold text-slate-900">
                {cell(column, row)}
              </div>
            ))}
            {details.length ? (
              <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-sm">
                {details.map((column) => (
                  <div key={column.key} className="contents">
                    <dt className="text-slate-500">{column.header}</dt>
                    <dd className="text-slate-800">{cell(column, row)}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
            {actions.map((column) => (
              <div key={column.key} className="flex flex-wrap gap-2 pt-1">
                {cell(column, row)}
              </div>
            ))}
          </li>
        ))}
      </ul>
    </>
  );
}
