/* ============================================================================
   PRC helpers — ported from the spec. Entity parsing, most-recent computation
   from the archive, projected-next sorting, and the Flex private fallback.
   ========================================================================== */
import { parseLocalDate, formatDateMMDDYYYY } from './dates';
import { applyAlias } from './roster';
import type { PrcArchive, PrcSchedule, PrcMapping } from './domain';

export function splitEnts(s: string | null | undefined): string[] {
  return s ? String(s).split('/').map((x) => x.trim()).filter(Boolean) : [];
}
export function joinEnts(arr: string[]): string {
  return arr.filter(Boolean).join('/');
}
export function normPres(s: string | null | undefined): string {
  return String(applyAlias(s) ?? '').toLowerCase().trim();
}

export function computeMostRecent(pres: string, archive: PrcArchive[]): string | null {
  const np = normPres(pres);
  let best: string | null = null;
  archive.forEach((a) => {
    if (normPres(a.presentation) === np && a.meetingDate) {
      if (!best || parseLocalDate(a.meetingDate)! > parseLocalDate(best)!) best = a.meetingDate;
    }
  });
  return best;
}

/** Most recent archive appearance of an entity within a given column. */
export function entityMostRecent(entity: string, col: 'act40' | 'hedgeFund' | 'private', archive: PrcArchive[]): string | null {
  let best: string | null = null;
  archive.forEach((a) => {
    const ents = splitEnts(a[col]).map((x) => applyAlias(x));
    if (ents.includes(applyAlias(entity)) && a.meetingDate) {
      if (!best || parseLocalDate(a.meetingDate)! > parseLocalDate(best)!) best = a.meetingDate;
    }
  });
  return best;
}

export function sortByProjected(rows: PrcSchedule[]): PrcSchedule[] {
  return [...rows].sort((a, b) => {
    const da = a.projectedNext ? parseLocalDate(a.projectedNext)!.getTime() : Infinity;
    const db = b.projectedNext ? parseLocalDate(b.projectedNext)!.getTime() : Infinity;
    return da - db;
  });
}

export interface RecentOpt {
  n: string;
  d: string | null;
}
/** Sort entity option labels by most-recent (none first, older->newer, ties alpha). */
export function sortOptsByRecent(names: string[], col: 'act40' | 'hedgeFund' | 'private' | 'presentation', archive: PrcArchive[]): RecentOpt[] {
  const recent = (n: string) =>
    col === 'presentation' ? computeMostRecent(n, archive) : entityMostRecent(n, col, archive);
  return names
    .map((n) => ({ n, d: recent(n) }))
    .sort((a, b) => {
      if (!a.d && !b.d) return a.n.localeCompare(b.n);
      if (!a.d) return -1;
      if (!b.d) return 1;
      const t = parseLocalDate(a.d)!.getTime() - parseLocalDate(b.d)!.getTime();
      return t !== 0 ? t : a.n.localeCompare(b.n);
    });
}
export function optLabel(o: RecentOpt): string {
  return o.n + ' — ' + (o.d ? formatDateMMDDYYYY(o.d) : '-');
}

/** Flex private fallback: flex-flagged private entity with the oldest archive
    appearance (never-archived = highest priority, alphabetical tiebreak). */
export function flexPrivateFallback(mapping: PrcMapping, archive: PrcArchive[]): string | null {
  const flex = mapping.privateGlobal.filter((e) => e.flex).map((e) => e.name);
  if (!flex.length) return null;
  const scored = flex
    .map((n) => ({ n, d: entityMostRecent(n, 'private', archive) }))
    .sort((a, b) => {
      if (!a.d && !b.d) return a.n.localeCompare(b.n);
      if (!a.d) return -1;
      if (!b.d) return 1;
      const t = parseLocalDate(a.d)!.getTime() - parseLocalDate(b.d)!.getTime();
      return t !== 0 ? t : a.n.localeCompare(b.n);
    });
  return scored[0].n;
}
