/* ============================================================================
   Monitoring helpers + spreadsheet import parser — ported from the spec.
   ========================================================================== */
import * as XLSX from 'xlsx';
import { parseLocalDate, todayLocal, formatDateMMDDYYYY, addDaysISO } from './dates';
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

export function rolloverLabel(iso: string | null): string {
  if (!iso) return 'Not Set';
  const d = parseLocalDate(iso)!;
  const q = Math.floor(d.getMonth() / 3) + 1;
  return 'Q' + q + ' ' + d.getFullYear();
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
