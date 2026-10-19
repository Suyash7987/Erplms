export const STATUSES = ['present', 'absent', 'late', 'half_day', 'on_leave'];

/** Colour per status, used consistently in marking, reports and the parent calendar. */
export const STATUS_STYLES = {
  present: 'bg-emerald-100 text-emerald-800 ring-emerald-300',
  absent: 'bg-red-100 text-red-800 ring-red-300',
  late: 'bg-amber-100 text-amber-800 ring-amber-300',
  half_day: 'bg-orange-100 text-orange-800 ring-orange-300',
  on_leave: 'bg-sky-100 text-sky-800 ring-sky-300',
};

/** One-letter code for dense registers (P, A, L, H, OL). */
export const STATUS_SHORT = { present: 'P', absent: 'A', late: 'L', half_day: 'H', on_leave: 'OL' };
