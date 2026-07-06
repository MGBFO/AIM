/* Formatting + small value coercions — ported from the spec. */

export function cleanCost(v: unknown): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return isFinite(v) ? Math.round(v) : null;
  const s = String(v).trim().toLowerCase();
  if (['x', 'na', 'n/a', '-', '', 'tbd'].includes(s)) return null;
  const n = parseFloat(String(v).replace(/[$,]/g, ''));
  return isFinite(n) ? Math.round(n) : null;
}

export function cleanDays(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = parseFloat(String(v));
  if (!isFinite(n)) return null;
  return Math.max(1, Math.round(n)); // 0.5 -> 1
}

export function moneyFmt(v: unknown): string {
  const n = cleanCost(v);
  return n == null ? '-' : '$' + n.toLocaleString('en-US');
}

export function isValidUrl(u: string | null | undefined): boolean {
  if (!u) return false;
  try {
    const x = new URL(/^https?:\/\//i.test(u) ? u : 'https://' + u);
    return !!x.hostname && x.hostname.includes('.');
  } catch {
    return false;
  }
}

export function normUrl(u: string): string {
  return /^https?:\/\//i.test(u) ? u : 'https://' + u;
}

/** Trigger a client-side file download. */
export function download(name: string, content: string, type = 'text/csv'): void {
  const b = new Blob([content], { type });
  const u = URL.createObjectURL(b);
  const a = document.createElement('a');
  a.href = u;
  a.download = name;
  a.click();
  URL.revokeObjectURL(u);
}
