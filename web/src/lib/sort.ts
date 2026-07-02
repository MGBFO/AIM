/* ============================================================================
   Generic column sort — ported verbatim from Analysis_in_Motion_V5.html.
   Sort cycle per column: asc -> desc -> off. Nulls/blanks always sort last.
   ========================================================================== */

export type SortDir = 'asc' | 'desc' | null;
export interface SortState {
  key: string | null;
  dir: SortDir;
}

export function nextSortDir(cur: SortState | null, key: string): SortState {
  if (!cur || cur.key !== key) return { key, dir: 'asc' };
  if (cur.dir === 'asc') return { key, dir: 'desc' };
  if (cur.dir === 'desc') return { key: null, dir: null };
  return { key, dir: 'asc' };
}

/** Caret glyph for a sortable header: ▲ asc, ▼ desc, "" off. */
export function sortCaret(cur: SortState | null, key: string): string {
  if (!cur || cur.key !== key || !cur.dir) return '';
  return cur.dir === 'asc' ? '▲' : '▼';
}

export function cmpVals(a: unknown, b: unknown): number {
  const na = a == null || a === '';
  const nb = b == null || b === '';
  if (na && nb) return 0;
  if (na) return 1;
  if (nb) return -1;
  if (typeof a === 'boolean' || typeof b === 'boolean') return (a ? 1 : 0) - (b ? 1 : 0);
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

export function applyColSort<T>(
  rows: T[],
  cur: SortState | null,
  get: (row: T, key: string) => unknown,
): T[] {
  if (!cur || !cur.key || !cur.dir) return rows;
  const key = cur.key;
  const f = cur.dir === 'desc' ? -1 : 1;
  return [...rows].sort((x, y) => f * cmpVals(get(x, key), get(y, key)));
}
