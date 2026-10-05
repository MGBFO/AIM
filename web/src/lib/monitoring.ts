/* ============================================================================
   Monitoring helpers + spreadsheet import parser — ported from the spec.
   ========================================================================== */
import * as XLSX from 'xlsx';
import { parseLocalDate, todayLocal, formatDateMMDDYYYY, addDaysISO, toISO } from './dates';
import { normalizeAnalystName } from './roster';
import { uid } from './util';
import { download } from './format';
import type { Monitoring } from './domain';
import type { MonitoringLevel } from './types';

export function levelDays(level: string): number {
  return level === 'Level 1' ? 90 : level === 'Level 2' ? 180 : 365;
}
export function parseLevel(raw: unknown): MonitoringLevel {
  if (!raw) return 'Level 1';
  const m = String(raw).match(/Level\s*([123])/i);
  return (m ? `Level ${m[1]}` : 'Level 1') as MonitoringLevel;
}
/** Computed status: Completed stays; a past monitoring date is Overdue. */
export function monStatus(m: Monitoring): string {
  if (m.status === 'Completed') return 'Completed';
  if (m.monitoringDate && parseLocalDate(m.monitoringDate)! < todayLocal()) return 'Overdue';
  return m.status;
}
export function isMonOverdue(m: Monitoring): boolean {
  return !m.archived && monStatus(m) === 'Overdue';
}
/**
 * Complete-and-roll-forward for a monitoring item — the single source of truth
 * shared by the Monitoring Process module and Analyst Bandwidth. Ends the
 * current cycle (stamps Most Recent = the cycle's Monitoring Date) and advances
 * the Monitoring Date to the next cycle: base + the item's Target Monitoring
 * Days (which is set per Monitoring Level). `base` is the global rollover anchor
 * when set, otherwise the current Monitoring Date. The item stays active — it is
 * never archived or removed here.
 */
export function completeAndRollForwardMonitoringItem(m: Monitoring, rolloverBase: string | null): Monitoring {
  const base = rolloverBase || m.monitoringDate;
  const nextDate = base ? addDaysISO(base, m.targetMonitoringDays) : m.monitoringDate;
  return { ...m, mostRecent: m.monitoringDate, monitoringDate: nextDate, status: 'Completed' };
}

/**
 * The date the current monitoring period closes for a level — i.e. the next
 * rollover boundary. Matches the Rollover schedule: Level 1 rolls quarterly
 * (Jan/Apr/Jul/Oct 1), Level 2 semiannually (Jan/Jul 1), Level 3 annually
 * (Jan 1). Returned as local ISO yyyy-mm-dd; the boundary strictly after today.
 */
export function monitoringPeriodEndISO(level: string, today: Date = todayLocal()): string {
  const months = level === 'Level 1' ? [0, 3, 6, 9] : level === 'Level 2' ? [0, 6] : [0];
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const y = today.getFullYear();
  const candidates: number[] = [];
  for (const yy of [y, y + 1]) for (const m of months) candidates.push(new Date(yy, m, 1).getTime());
  candidates.sort((a, b) => a - b);
  const next = candidates.find((c) => c > t0)!;
  const d = new Date(next);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function rolloverLabel(iso: string | null): string {
  if (!iso) return 'Not Set';
  const d = parseLocalDate(iso)!;
  const q = Math.floor(d.getMonth() / 3) + 1;
  return 'Q' + q + ' ' + d.getFullYear();
}

/* ─── rollover validation + apply ────────────────────────────────────────────
   The rollover schedule: which levels roll on which boundary month (0-indexed).
   Apr → L1; Jul → L1+L2; Oct → L1; Jan → all three. */
export const ROLLOVER_APPLIES: Record<number, string[]> = {
  3: ['Level 1'], 6: ['Level 1', 'Level 2'], 9: ['Level 1'], 0: ['Level 1', 'Level 2', 'Level 3'],
};

/** The four rollover dropdown options for a year: [label mm/dd/yyyy, iso]. */
export function rolloverOptions(year: number): [string, string][] {
  return [
    [`04/01/${year}`, `${year}-04-01`],
    [`07/01/${year}`, `${year}-07-01`],
    [`10/01/${year}`, `${year}-10-01`],
    [`01/01/${year + 1}`, `${year + 1}-01-01`],
  ];
}

/**
 * Default rollover selection: the first rollover date on or after today. If
 * today is after every rollover date in `year`, falls through to 01/01 of the
 * next year (always present as the last option). ISO yyyy-mm-dd sorts
 * chronologically, so a lexical `>=` compare is correct.
 */
export function defaultRolloverIso(todayIso: string, year: number): string {
  const opts = rolloverOptions(year);
  return (opts.find(([, v]) => v >= todayIso) || opts[opts.length - 1])[1];
}

export interface RolloverBadRow extends Monitoring {
  expected: string | null;
  reason: string;
}

/**
 * Non-compliant rollover records for a chosen rollover date. Completed records
 * are treated as compliant when there is completion evidence — a Most Recent
 * Date, or a Monitoring Date we can carry over; only a Completed record missing
 * BOTH is blocked. Non-Completed applicable records keep the existing
 * expected-date rule exactly (expected = rollover date + Target Monitoring Days;
 * flagged when a present Monitoring Date differs). The expected-date formula is
 * unchanged.
 */
export function rolloverNonCompliant(active: Monitoring[], pickIso: string): RolloverBadRow[] {
  const d = parseLocalDate(pickIso)!;
  const applies = ROLLOVER_APPLIES[d.getMonth()] || ['Level 1'];
  const bad: RolloverBadRow[] = [];
  for (const m of active) {
    if (m.archived || !applies.includes(m.level)) continue;
    if (m.status === 'Completed') {
      if (m.mostRecent || m.monitoringDate) continue; // has completion evidence
      bad.push({ ...m, expected: null, reason: 'Completed with no Most Recent or Monitoring Date — no completion evidence.' });
      continue;
    }
    const expected = addDaysISO(pickIso, m.targetMonitoringDays);
    if (m.monitoringDate && toISO(m.monitoringDate) !== expected) {
      bad.push({ ...m, expected, reason: 'Monitoring Date does not match the Expected Monitoring Date.' });
    }
  }
  return bad;
}

/**
 * Apply a rollover to the monitoring list for a chosen rollover date. For each
 * applicable (non-archived, in-scope level) record: preserve completion
 * evidence — a Completed record with no Most Recent Date but a Monitoring Date
 * keeps that date as Most Recent before any reset — then reset Completed status
 * to Not Started, and clear Annual Onsite / Compliance Check for Level 1 on the
 * Jan 1 boundary. Monitoring Date is left to the existing next-date logic
 * (unchanged here). Returns a new array; archived/out-of-scope rows pass through.
 */
export function applyRollover(monitoring: Monitoring[], iso: string): Monitoring[] {
  const d = parseLocalDate(iso)!;
  const isJan1 = d.getMonth() === 0 && d.getDate() === 1;
  const applies = ROLLOVER_APPLIES[d.getMonth()] || ['Level 1'];
  return monitoring.map((m) => {
    if (m.archived || !applies.includes(m.level)) return m;
    const nm = { ...m };
    if (nm.status === 'Completed' && !nm.mostRecent && nm.monitoringDate) nm.mostRecent = nm.monitoringDate;
    if (nm.status === 'Completed') nm.status = 'Not Started';
    if (isJan1 && m.level === 'Level 1') { nm.annualOnsite = false; nm.complianceCheck = false; }
    return nm;
  });
}

/* ─── import ─────────────────────────────────────────────────────────────── */
export interface ImportDiag {
  fileName: string;
  sheets: string[];
  detected: number;
  imported: number;
  skipped: number;
  warnings: string[];
  errors: string[];
  note?: string;
}

/** Coerce a spreadsheet cell to {iso, text}. iso is local yyyy-mm-dd or null. */
export function excelToISO(v: unknown): { iso: string | null; text: string } {
  if (v == null || v === '') return { iso: null, text: '' };
  if (v instanceof Date && !isNaN(v.getTime())) {
    return {
      iso: `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`,
      text: '',
    };
  }
  if (typeof v === 'number' && isFinite(v)) {
    try {
      const d = XLSX.SSF?.parse_date_code?.(v);
      if (d && d.y) {
        return { iso: `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`, text: '' };
      }
    } catch {
      /* fall through */
    }
    return { iso: null, text: String(v) };
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return { iso: `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`, text: '' };
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) {
    let y = m[3];
    if (y.length === 2) y = (+y < 70 ? '20' : '19') + y;
    return { iso: `${y}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`, text: '' };
  }
  if (/^#N\/A|^n\/?a$/i.test(s)) return { iso: null, text: '' };
  return { iso: null, text: s };
}

type Cell = unknown;
export function findHeaderRow(aoa: Cell[][]): number {
  for (let i = 0; i < Math.min(aoa.length, 15); i++) {
    const row = (aoa[i] || []).map((c) => String(c == null ? '' : c).toLowerCase().trim());
    const hasFund = row.some((c) => c === 'fund' || c.includes('fund'));
    const hasLevel = row.some((c) => c.includes('level'));
    const hasAnalyst = row.some((c) => c.includes('analyst'));
    if (hasFund && (hasLevel || hasAnalyst)) return i;
  }
  return -1;
}
export function colIndex(headerRow: Cell[], ...names: string[]): number {
  const h = headerRow.map((c) => String(c == null ? '' : c).toLowerCase().trim());
  for (const n of names) {
    const i = h.findIndex((c) => c === n);
    if (i >= 0) return i;
  }
  for (const n of names) {
    const i = h.findIndex((c) => c.includes(n));
    if (i >= 0) return i;
  }
  return -1;
}

export interface SheetParse {
  records: Monitoring[];
  diag: { detected: number; imported: number; skipped: number; warnings: string[] };
  headerFound: boolean;
}

/** Parse one sheet's array-of-arrays into monitoring records + diagnostics. */
export function parseMonitoringSheet(aoa: Cell[][]): SheetParse {
  const diag = { detected: 0, imported: 0, skipped: 0, warnings: [] as string[] };
  const records: Monitoring[] = [];
  const hi = findHeaderRow(aoa);
  if (hi < 0) {
    diag.warnings.push("No recognizable header row (need a 'Fund' column).");
    return { records, diag, headerFound: false };
  }
  const hdr = aoa[hi];
  const cFund = colIndex(hdr, 'fund');
  const cAnalyst = colIndex(hdr, 'analyst');
  const cLevel = colIndex(hdr, 'monitoring level', 'level');
  const cRecent = colIndex(hdr, 'most recent', 'most recent date', 'recent');
  const cMon = colIndex(hdr, 'monitoring date', 'next monitoring', 'monitoring');
  const cTarget = colIndex(hdr, 'target monitoring days', 'target days', 'monitoring days', 'target');
  if (cFund < 0) {
    diag.warnings.push('Could not locate a Fund column.');
    return { records, diag, headerFound: true };
  }
  let lastAnalyst = '';
  for (let r = hi + 1; r < aoa.length; r++) {
    const row = aoa[r] || [];
    if (row.every((c) => c == null || String(c).trim() === '')) continue;
    diag.detected++;
    const fund = cFund >= 0 ? String(row[cFund] == null ? '' : row[cFund]).trim() : '';
    const analystRaw = cAnalyst >= 0 ? String(row[cAnalyst] == null ? '' : row[cAnalyst]).trim() : '';
    if (analystRaw) lastAnalyst = analystRaw;
    if (!fund) {
      diag.skipped++;
      continue;
    }
    const analyst = normalizeAnalystName(analystRaw || lastAnalyst);
    const level = parseLevel(cLevel >= 0 ? row[cLevel] : '');
    const l1 = level === 'Level 1';
    const rec = excelToISO(cRecent >= 0 ? row[cRecent] : null);
    const mon = excelToISO(cMon >= 0 ? row[cMon] : null);
    if (cRecent >= 0 && rec.text)
      diag.warnings.push(`Row ${r + 1}: unreadable Most Recent date "${rec.text}" ignored.`);
    if (cMon >= 0 && mon.text)
      diag.warnings.push(`Row ${r + 1}: unreadable Monitoring date "${mon.text}" ignored.`);
    let target = levelDays(level);
    if (cTarget >= 0) {
      const tv = row[cTarget];
      const n = typeof tv === 'number' ? tv : parseInt(String(tv == null ? '' : tv).replace(/[^0-9.-]/g, ''), 10);
      if (isFinite(n) && n > 0) target = Math.round(n);
      else if (tv != null && String(tv).trim() !== '')
        diag.warnings.push(`Row ${r + 1}: invalid Target Monitoring Days "${tv}", defaulted to ${target}.`);
    }
    records.push({
      id: uid('mon'), fund, analyst, level, mostRecent: rec.iso, monitoringDate: mon.iso,
      status: 'Not Started', annualOnsite: l1, complianceCheck: l1, targetMonitoringDays: target,
      archived: false,
    });
    diag.imported++;
  }
  return { records, diag, headerFound: true };
}

export function readMonitoringWorkbook(data: ArrayBuffer, fileName: string): { records: Monitoring[]; diag: ImportDiag } {
  const diag: ImportDiag = { fileName, sheets: [], detected: 0, imported: 0, skipped: 0, warnings: [], errors: [] };
  const wb = XLSX.read(new Uint8Array(data), { type: 'array', cellDates: true });
  let all: Monitoring[] = [];
  const preferred = wb.SheetNames.filter((n) => /coverage|monitor/i.test(n));
  const order = preferred.length ? preferred : wb.SheetNames;
  order.forEach((name) => {
    const ws = wb.Sheets[name];
    if (!ws) return;
    const aoa = XLSX.utils.sheet_to_json<Cell[]>(ws, { header: 1, raw: true, defval: '' });
    const { records, diag: d, headerFound } = parseMonitoringSheet(aoa);
    if (headerFound) {
      diag.sheets.push(name);
      diag.detected += d.detected;
      diag.imported += d.imported;
      diag.skipped += d.skipped;
      diag.warnings.push(...d.warnings);
      all = all.concat(records);
    }
  });
  if (!diag.sheets.length) diag.note = 'No sheet contained a recognizable Fund column.';
  return { records: all, diag };
}

/** Minimal CSV row splitter (quotes + doubled-quote escapes). */
export function parseCsv(text: string): string[][] {
  return text
    .split(/\r?\n/)
    .map((line) => {
      const out: string[] = [];
      let cur = '';
      let q = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (q) {
          if (ch === '"') {
            if (line[i + 1] === '"') { cur += '"'; i++; } else q = false;
          } else cur += ch;
        } else if (ch === '"') q = true;
        else if (ch === ',') { out.push(cur); cur = ''; }
        else cur += ch;
      }
      out.push(cur);
      return out;
    })
    .filter((r) => r.length && !(r.length === 1 && r[0].trim() === ''));
}

// Export header + row layout — identical for CSV and XLSX and matching what the
// importer reads (Fund/Analyst/Monitoring Level/Most Recent Date/Monitoring
// Date/Target Monitoring Days). Status/Annual Onsite/Compliance Check are kept
// for reference; the importer ignores them. A file exported here re-imports
// cleanly.
const EXPORT_HEAD = ['Fund', 'Analyst', 'Monitoring Level', 'Most Recent Date', 'Monitoring Date', 'Status', 'Target Monitoring Days', 'Annual Onsite', 'Compliance Check'];
function exportRow(m: Monitoring): (string | number)[] {
  return [m.fund, m.analyst, m.level, formatDateMMDDYYYY(m.mostRecent), formatDateMMDDYYYY(m.monitoringDate), monStatus(m), m.targetMonitoringDays, m.annualOnsite ? 'Yes' : 'No', m.complianceCheck ? 'Yes' : 'No'];
}
function exportName(ext: string): string {
  return 'AIM_Monitoring_' + todayLocal().getFullYear() + '.' + ext;
}

export function exportMonitoring(active: Monitoring[]): void {
  const lines = [EXPORT_HEAD.join(',')].concat(
    active.map((m) => exportRow(m).map((x) => '"' + String(x == null ? '' : x).replace(/"/g, '""') + '"').join(',')),
  );
  download(exportName('csv'), lines.join('\n'));
}

export function exportMonitoringXlsx(active: Monitoring[]): void {
  const ws = XLSX.utils.aoa_to_sheet([EXPORT_HEAD, ...active.map(exportRow)]);
  const wb = XLSX.utils.book_new();
  // Sheet name matches the importer's preferred /coverage|monitor/ pattern so a
  // re-import auto-selects it.
  XLSX.utils.book_append_sheet(wb, ws, 'New Coverage');
  XLSX.writeFile(wb, exportName('xlsx'));
}
