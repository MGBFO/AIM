/* ============================================================================
   Cross-module task linkage. A task created from Travel Schedule or Monitoring
   Process carries (sourceModule, sourceId) pointing at its origin row. This
   keeps the two in sync for the fields they share — due date, assigned
   analyst, and (monitoring) completion status — so an edit in any module shows
   up everywhere it's relevant. The Workflow Calendar is a read-only view of
   tasks + trips, so it reflects these changes automatically.

   Direction is resolved by diffing prev -> draft: whichever side changed a
   field this patch wins; if a field only drifted historically (neither side
   changed it now) it's left alone. Source -> task writes are limited to OPEN
   tasks so historical/completed rows aren't rewritten. Mutates `draft`.
   ========================================================================== */
import type { AimState, Task } from './domain';
import { normalizeAnalystName, parseTravelAnalysts } from './roster';

const TRAVEL = 'Travel Schedule';
const MON = 'Monitoring Process';

/** Which side to copy from: 'A' = task -> source, 'B' = source -> task. */
function pick(aNow: string, aPrev: string, bNow: string, bPrev: string): 'A' | 'B' | null {
  if (aNow === bNow) return null; // already agree
  if (aNow !== aPrev) return 'A'; // task changed this patch -> push to source
  if (bNow !== bPrev) return 'B'; // source changed this patch -> push to task
  return null; // pre-existing drift — don't clobber either side
}

const dstr = (v: string | null | undefined) => v ?? '';
function analystKey(names: string[]): string {
  return [...new Set(names.map((n) => normalizeAnalystName(n)))].sort().join('|');
}
function canonAnalysts(names: string[]): string[] {
  const out = [...new Set(names.map((n) => normalizeAnalystName(n)))];
  return out.length ? out : ['Unassigned'];
}

export function reconcileTaskLinks(prev: AimState, draft: AimState): void {
  const pTask = new Map(prev.tasks.map((t) => [t.id, t]));
  const pTrip = new Map(prev.trips.map((r) => [r.id, r]));
  const pMon = new Map(prev.monitoring.map((r) => [r.id, r]));
  const dTrip = new Map(draft.trips.map((r) => [r.id, r]));
  const dMon = new Map(draft.monitoring.map((r) => [r.id, r]));

  for (const t of draft.tasks) {
    if (!t.sourceId) continue;
    const pt: Task | undefined = pTask.get(t.id);
    const open = t.status === 'open';

    if (t.sourceModule === TRAVEL) {
      const trip = dTrip.get(t.sourceId);
      if (!trip) continue;
      const ptr = pTrip.get(trip.id);
      // due date <-> trip.date
      const dd = pick(dstr(t.dueDate), dstr(pt?.dueDate ?? t.dueDate), dstr(trip.date), dstr(ptr?.date ?? trip.date));
      if (dd === 'A') trip.date = t.dueDate;
      else if (dd === 'B' && open) t.dueDate = trip.date;
      // analysts <-> trip.analyst (free-text, slash/&-separated)
      const ad = pick(analystKey(t.analysts), analystKey(pt?.analysts ?? t.analysts), analystKey(parseTravelAnalysts(trip.analyst)), analystKey(parseTravelAnalysts(ptr?.analyst ?? trip.analyst)));
      if (ad === 'A') trip.analyst = canonAnalysts(t.analysts).filter((n) => n !== 'Unassigned').join('/') || 'Unassigned';
      else if (ad === 'B' && open) t.analysts = canonAnalysts(parseTravelAnalysts(trip.analyst));
    } else if (t.sourceModule === MON) {
      const mon = dMon.get(t.sourceId);
      if (!mon) continue;
      const pm = pMon.get(mon.id);
      // due date <-> monitoring date
      const dd = pick(dstr(t.dueDate), dstr(pt?.dueDate ?? t.dueDate), dstr(mon.monitoringDate), dstr(pm?.monitoringDate ?? mon.monitoringDate));
      if (dd === 'A') mon.monitoringDate = t.dueDate;
      else if (dd === 'B' && open) t.dueDate = mon.monitoringDate;
      // analyst (single) <-> mon.analyst
      const taskA = normalizeAnalystName(t.analysts[0] ?? 'Unassigned');
      const ad = pick(taskA, normalizeAnalystName(pt?.analysts?.[0] ?? taskA), normalizeAnalystName(mon.analyst), normalizeAnalystName(pm?.analyst ?? mon.analyst));
      if (ad === 'A') mon.analyst = taskA;
      else if (ad === 'B' && open) t.analysts = [normalizeAnalystName(mon.analyst)];
      // completion status: task 'completed' <-> mon.status 'Completed'
      const sd = pick(
        t.status === 'completed' ? 'C' : 'O', (pt?.status ?? t.status) === 'completed' ? 'C' : 'O',
        mon.status === 'Completed' ? 'C' : 'O', (pm?.status ?? mon.status) === 'Completed' ? 'C' : 'O',
      );
      if (sd === 'A') mon.status = t.status === 'completed' ? 'Completed' : (mon.status === 'Completed' ? 'In Progress' : mon.status);
      else if (sd === 'B') {
        if (mon.status === 'Completed' && t.status !== 'completed') { t.status = 'completed'; t.completedAt = new Date().toISOString(); }
        else if (mon.status !== 'Completed' && t.status === 'completed') { t.status = 'open'; t.completedAt = null; }
      }
    }
  }
}
