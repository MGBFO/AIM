/* ============================================================================
   Local-date discipline — ported verbatim from Analysis_in_Motion_V5.html.
   ALL dates in AIM are LOCAL calendar dates. Never construct a Date that can
   shift across a timezone boundary. Postgres stores `date`; the wire format is
   the local ISO string "yyyy-mm-dd". Do not use `new Date(isoString)` for a
   date-only value (that parses as UTC midnight and drifts). Always route
   through parseLocalDate / toISO.
   ========================================================================== */

export type ISODate = string; // "yyyy-mm-dd"
export type DateRange = [Date, Date];

export function parseLocalDate(s: unknown): Date | null {
  if (!s) return null;
  if (s instanceof Date) return new Date(s.getFullYear(), s.getMonth(), s.getDate());
  if (typeof s !== 'string') return null;
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return new Date(+m[3], +m[1] - 1, +m[2]);
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function toISO(d: unknown): ISODate | null {
  if (!d) return null;
  const x = parseLocalDate(d);
  if (!x) return null;
  return (
    x.getFullYear() +
    '-' +
    String(x.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(x.getDate()).padStart(2, '0')
  );
}

/** User-facing format. All dates render mm/dd/yyyy. */
export function formatDateMMDDYYYY(s: unknown): string {
  const d = parseLocalDate(s);
  if (!d) return '-';
  return (
    String(d.getMonth() + 1).padStart(2, '0') +
    '/' +
    String(d.getDate()).padStart(2, '0') +
    '/' +
    d.getFullYear()
  );
}

export function todayLocal(): Date {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}

export function addDaysISO(s: unknown, n: number): ISODate | null {
  const d = parseLocalDate(s);
  if (!d) return null;
  d.setDate(d.getDate() + n);
  return toISO(d);
}

export type RecurrenceType =
  | 'none'
  | 'monthly'
  | 'quarterly'
  | 'semiAnnual'
  | 'annual'
  | 'custom';
export type RecurrenceUnit = 'days' | 'weeks' | 'months' | 'years';

/** Advance a due date by a recurrence rule, clamping to end-of-month. */
export function addRecurringInterval(
  iso: ISODate | null,
  type: RecurrenceType,
  interval?: number | null,
  unit?: RecurrenceUnit | null,
): ISODate | null {
  const d = parseLocalDate(iso);
  if (!d) return iso;
  const addMonths = (base: Date, m: number): Date => {
    const day = base.getDate();
    const nd = new Date(base.getFullYear(), base.getMonth() + m, 1);
    const last = new Date(nd.getFullYear(), nd.getMonth() + 1, 0).getDate();
    nd.setDate(Math.min(day, last));
    return nd;
  };
  let r: Date;
  if (type === 'monthly') r = addMonths(d, 1);
  else if (type === 'quarterly') r = addMonths(d, 3);
  else if (type === 'semiAnnual') r = addMonths(d, 6);
  else if (type === 'annual') r = addMonths(d, 12);
  else if (type === 'custom') {
    const k = interval || 1;
    if (unit === 'days') { r = new Date(d); r.setDate(d.getDate() + k); }
    else if (unit === 'weeks') { r = new Date(d); r.setDate(d.getDate() + k * 7); }
    else if (unit === 'months') r = addMonths(d, k);
    else if (unit === 'years') r = addMonths(d, k * 12);
    else r = d;
  } else r = d;
  return toISO(r);
}

export function getLocalMonthRange(d?: Date): DateRange {
  const x = d || todayLocal();
  return [new Date(x.getFullYear(), x.getMonth(), 1), new Date(x.getFullYear(), x.getMonth() + 1, 0)];
}
export function getNextLocalMonthRange(d?: Date): DateRange {
  const x = d || todayLocal();
  return [new Date(x.getFullYear(), x.getMonth() + 1, 1), new Date(x.getFullYear(), x.getMonth() + 2, 0)];
}
export function getLocalQuarterRange(d?: Date): DateRange {
  const x = d || todayLocal();
  const q = Math.floor(x.getMonth() / 3);
  return [new Date(x.getFullYear(), q * 3, 1), new Date(x.getFullYear(), q * 3 + 3, 0)];
}
export function getNextLocalQuarterRange(d?: Date): DateRange {
  const x = d || todayLocal();
  const q = Math.floor(x.getMonth() / 3);
  return [new Date(x.getFullYear(), q * 3 + 3, 1), new Date(x.getFullYear(), q * 3 + 6, 0)];
}
export function getLocalYearRange(d?: Date): DateRange {
  const x = d || todayLocal();
  return [new Date(x.getFullYear(), 0, 1), new Date(x.getFullYear(), 11, 31)];
}
export function getNextLocalYearRange(d?: Date): DateRange {
  const x = d || todayLocal();
  return [new Date(x.getFullYear() + 1, 0, 1), new Date(x.getFullYear() + 1, 11, 31)];
}

export function inRange(iso: unknown, r: DateRange): boolean {
  const d = parseLocalDate(iso);
  if (!d) return false;
  return d >= r[0] && d <= r[1];
}
