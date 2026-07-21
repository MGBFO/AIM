import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { showToast } from '../lib/toast';
import { addRecurringInterval } from '../lib/dates';
import { uid } from '../lib/util';
import { diffById } from '../lib/diff';
import { reconcileTaskLinks } from '../lib/sync';
import { completeAndRollForwardMonitoringItem } from '../lib/monitoring';
import { initUserPrefs } from '../lib/userPrefs';
import { AimContext, type AimApi } from '../hooks/useAim';
import {
  type AimState, type Task, EMPTY_MAPPING,
  tripFromRow, monitoringFromRow, prcScheduleFromRow, prcArchiveFromRow, taskFromRow, usefulLinkFromRow,
  tripToRow, monitoringToRow, prcScheduleToRow, prcArchiveToRow, taskToRow, usefulLinkToRow,
} from '../lib/domain';
import { makeTask } from '../lib/tasks';

const PREFS_KEY = 'aim.prefs';

/** state-slice key -> table config. */
interface TableCfg {
  key: 'trips' | 'monitoring' | 'prcSchedule' | 'prcArchive' | 'tasks' | 'usefulLinks';
  table: string;
  fromRow: (r: Record<string, unknown>) => { id: string; updatedAt?: string };
  toRow: (d: unknown) => Record<string, unknown>;
}
/* eslint-disable @typescript-eslint/no-explicit-any */
const TABLES: TableCfg[] = [
  { key: 'trips', table: 'trips', fromRow: tripFromRow as any, toRow: tripToRow as any },
  { key: 'monitoring', table: 'monitoring', fromRow: monitoringFromRow as any, toRow: monitoringToRow as any },
  { key: 'prcSchedule', table: 'prc_schedule', fromRow: prcScheduleFromRow as any, toRow: prcScheduleToRow as any },
  { key: 'prcArchive', table: 'prc_archive', fromRow: prcArchiveFromRow as any, toRow: prcArchiveToRow as any },
  { key: 'tasks', table: 'tasks', fromRow: taskFromRow as any, toRow: taskToRow as any },
  { key: 'usefulLinks', table: 'useful_links', fromRow: usefulLinkFromRow as any, toRow: usefulLinkToRow as any },
];
/* eslint-enable @typescript-eslint/no-explicit-any */

const emptyState = (): AimState => ({
  trips: [], monitoring: [], prcSchedule: [], prcArchive: [], prcMapping: EMPTY_MAPPING,
  tasks: [], usefulLinks: [], monRollover: null,
  prefs: loadPrefs(),
});

function loadPrefs(): { abPeriod: string } {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) return { abPeriod: 'Current Month', ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { abPeriod: 'Current Month' };
}

// Dynamically-named table access needs the loosely-typed client surface.
const dyn = supabase as unknown as SupabaseClient;

export function AimProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AimState>(emptyState);
  const [ready, setReady] = useState(false);
  const stateRef = useRef<AimState>(state);
  const undoStack = useRef<AimState[]>([]);
  const redoStack = useRef<AimState[]>([]);
  // known server updated_at per table+id, for optimistic-concurrency predicates
  const known = useRef<Record<string, Map<string, string>>>({});

  const commit = useCallback((next: AimState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  // ─── initial load ─────────────────────────────────────────────────────────
  const refetchTable = useCallback(async (cfg: TableCfg) => {
    const { data, error } = await dyn.from(cfg.table).select('*');
    if (error) { console.error('load', cfg.table, error); return; }
    const rows = (data ?? []).map((r) => cfg.fromRow(r as Record<string, unknown>));
    const m = new Map<string, string>();
    rows.forEach((r) => { if (r.updatedAt) m.set(r.id, r.updatedAt); });
    known.current[cfg.table] = m;
    commit({ ...stateRef.current, [cfg.key]: rows });
  }, [commit]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // per-row tables
      await Promise.all(TABLES.map((c) => refetchTable(c)));
      // singletons: prc mapping + rollover
      const [{ data: cfg }, { data: app }] = await Promise.all([
        dyn.from('prc_config').select('key,value'),
        dyn.from('app_config').select('key,value'),
      ]);
      if (cancelled) return;
      // Load this user's saved UI prefs (Save View, etc.) before we go ready,
      // so modules read a warm cache.
      try { const { data: u } = await dyn.auth.getUser(); await initUserPrefs(u?.user?.id ?? null); } catch { await initUserPrefs(null); }
      if (cancelled) return;
      const mapping = (cfg ?? []).find((r: { key: string }) => r.key === 'mapping')?.value;
      const roll = (app ?? []).find((r: { key: string }) => r.key === 'mon_rollover')?.value;
      commit({
        ...stateRef.current,
        prcMapping: (mapping as AimState['prcMapping']) ?? EMPTY_MAPPING,
        monRollover: (roll as string) ?? null,
      });
      setReady(true);
    })();
    return () => { cancelled = true; };
  }, [commit, refetchTable]);

  // ─── realtime: apply others' changes without re-persisting or touching undo ─
  useEffect(() => {
    const chan = supabase.channel('aim-all');
    TABLES.forEach((cfg) => {
      chan.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: cfg.table },
        (payload: { eventType: string; new: Record<string, unknown>; old: Record<string, unknown> }) => {
          const cur = stateRef.current;
          const list = cur[cfg.key] as { id: string; updatedAt?: string }[];
          const m = known.current[cfg.table] ?? new Map();
          if (payload.eventType === 'DELETE') {
            const id = (payload.old?.id as string) ?? '';
            m.delete(id);
            commit({ ...cur, [cfg.key]: list.filter((r) => r.id !== id) });
          } else {
            const row = cfg.fromRow(payload.new);
            if (row.updatedAt) m.set(row.id, row.updatedAt);
            const exists = list.some((r) => r.id === row.id);
            const nextList = exists ? list.map((r) => (r.id === row.id ? row : r)) : [...list, row];
            commit({ ...cur, [cfg.key]: nextList });
          }
          known.current[cfg.table] = m;
        },
      );
    });
    chan.subscribe();
    return () => { supabase.removeChannel(chan); };
  }, [commit]);

  // ─── persistence for one array table slice ─────────────────────────────────
  const syncTable = useCallback(async (cfg: TableCfg, prev: unknown[], next: unknown[]) => {
    const d = diffById(prev as { id: string }[], next as { id: string }[]);
    const m = known.current[cfg.table] ?? (known.current[cfg.table] = new Map());
    if (d.inserts.length) {
      // One round-trip for the whole batch (an import can be hundreds of rows).
      const rows = d.inserts.map((r) => cfg.toRow(r));
      const { data, error } = await dyn.from(cfg.table).insert(rows).select();
      if (error) {
        // Surface the real Postgres/PostgREST reason instead of a generic message —
        // one legible toast for the batch, not one per row.
        console.error('insert', cfg.table, error, { attempted: rows.length });
        const detail = error.message || error.details || error.hint || error.code || 'unknown error';
        const what = rows.length > 1 ? `${rows.length} new records` : 'a new record';
        showToast('error', `Could not save ${what}: ${detail}`);
        await refetchTable(cfg);
      } else {
        for (const row of (data ?? []) as { id: string; updated_at?: string }[]) {
          if (row.updated_at) m.set(row.id, row.updated_at);
        }
      }
    }
    for (const r of d.updates) {
      const prevUpdated = m.get((r as { id: string }).id);
      let q = dyn.from(cfg.table).update(cfg.toRow(r)).eq('id', (r as { id: string }).id);
      if (prevUpdated) q = q.eq('updated_at', prevUpdated);
      const { data, error } = await q.select().maybeSingle();
      if (error) { console.error('update', cfg.table, error); showToast('error', 'Could not save your change.'); await refetchTable(cfg); continue; }
      if (!data) {
        // no row matched the updated_at predicate -> someone else changed it first
        showToast('warning', 'This record was just updated by someone else — reloaded.');
        await refetchTable(cfg);
      } else if ((data as { updated_at?: string }).updated_at) {
        m.set((data as { id: string }).id, (data as { updated_at: string }).updated_at);
      }
    }
    for (const id of d.deletes) {
      const { error } = await dyn.from(cfg.table).delete().eq('id', id);
      if (error) { console.error('delete', cfg.table, error); showToast('error', 'Could not delete a record.'); await refetchTable(cfg); }
      else m.delete(id);
    }
  }, [refetchTable]);

  const persist = useCallback(async (prev: AimState, next: AimState) => {
    for (const cfg of TABLES) {
      const a = prev[cfg.key] as unknown[];
      const b = next[cfg.key] as unknown[];
      if (a !== b) await syncTable(cfg, a, b);
    }
    if (JSON.stringify(prev.prcMapping) !== JSON.stringify(next.prcMapping)) {
      const { error } = await dyn.from('prc_config').upsert({ key: 'mapping', value: next.prcMapping }, { onConflict: 'key' });
      if (error) { console.error('mapping', error); showToast('error', 'Could not save mapping.'); }
    }
    if (prev.monRollover !== next.monRollover) {
      const { error } = await dyn.from('app_config').upsert({ key: 'mon_rollover', value: next.monRollover }, { onConflict: 'key' });
      if (error) console.error('rollover', error);
    }
    if (prev.prefs.abPeriod !== next.prefs.abPeriod) {
      try { localStorage.setItem(PREFS_KEY, JSON.stringify(next.prefs)); } catch { /* ignore */ }
    }
  }, [syncTable]);

  // ─── patch / undo / redo ───────────────────────────────────────────────────
  const patch = useCallback((mutator: (s: AimState) => void) => {
    const prev = stateRef.current;
    const draft: AimState = structuredClone(prev);
    mutator(draft);
    reconcileTaskLinks(prev, draft); // keep linked tasks/trips/monitoring in sync
    undoStack.current.push(prev);
    if (undoStack.current.length > 80) undoStack.current.shift();
    redoStack.current = [];
    commit(draft);
    void persist(prev, draft);
  }, [commit, persist]);

  const undo = useCallback(() => {
    if (!undoStack.current.length) { showToast('info', 'Nothing to undo.'); return; }
    const prev = undoStack.current.pop()!;
    const cur = stateRef.current;
    redoStack.current.push(cur);
    commit(prev);
    void persist(cur, prev);
    showToast('info', 'Undo.');
  }, [commit, persist]);

  const redo = useCallback(() => {
    if (!redoStack.current.length) { showToast('info', 'Nothing to redo.'); return; }
    const nxt = redoStack.current.pop()!;
    const cur = stateRef.current;
    undoStack.current.push(cur);
    commit(nxt);
    void persist(cur, nxt);
    showToast('info', 'Redo.');
  }, [commit, persist]);

  // ─── task ops (mirror the legacy api) ──────────────────────────────────────
  const addTask = useCallback<AimApi['addTask']>((p, opts) => {
    const isImport = opts?.import;
    if (!isImport && !p.dueDate) { showToast('error', 'Add a Due Date before creating this task.'); return null; }
    const s = stateRef.current;
    if (p.sourceModule && p.sourceModule !== 'Manual' && p.sourceId) {
      const dup = s.tasks.find((t) => t.sourceModule === p.sourceModule && t.sourceId === p.sourceId && t.status === 'open');
      if (dup) { showToast('warning', 'Task already exists for this source.'); return null; }
    }
    const created = makeTask(p);
    patch((st) => { st.tasks = [...st.tasks, created]; });
    return created;
  }, [patch]);

  const updateTask = useCallback((id: string, changes: Partial<Task>) => {
    patch((s) => { s.tasks = s.tasks.map((t) => (t.id === id ? { ...t, ...changes } : t)); });
  }, [patch]);

  const deleteTask = useCallback((id: string) => {
    patch((s) => { s.tasks = s.tasks.filter((t) => t.id !== id); });
  }, [patch]);

  const completeTask = useCallback((id: string) => {
    const t = stateRef.current.tasks.find((x) => x.id === id);
    if (!t) return;
    const now = new Date().toISOString();
    // Monitoring calls: end the current cycle AND roll the linked monitoring
    // item forward to its next cycle — same logic as the Monitoring Process
    // module (completeAndRollForwardMonitoringItem).
    if (t.sourceModule === 'Monitoring Process' && t.sourceId) {
      const mon = stateRef.current.monitoring.find((x) => x.id === t.sourceId && !x.archived);
      if (mon) {
        const hist = [...(t.completedHistory || []), { id: uid('h'), completedDueDate: t.dueDate, completedAt: now, completedBy: 'User', note: '' }];
        patch((s) => {
          s.monitoring = s.monitoring.map((x) => (x.id === mon.id ? completeAndRollForwardMonitoringItem(x, s.monRollover) : x));
          s.tasks = s.tasks.map((x) => (x.id === id ? { ...x, status: 'completed', completedAt: now, completedHistory: hist } : x));
        });
        showToast('success', 'Monitoring call completed — rolled forward to the next cycle.');
        return;
      }
    }
    if (t.recurrenceType && t.recurrenceType !== 'none') {
      if (!t.dueDate) { showToast('error', 'Add a due date before completing a recurring task.'); return; }
      const hist = [...(t.completedHistory || []), { id: uid('h'), completedDueDate: t.dueDate, completedAt: now, completedBy: 'User', note: '' }];
      const next = addRecurringInterval(t.dueDate, t.recurrenceType as never, t.recurrenceInterval, t.recurrenceUnit as never);
      patch((s) => { s.tasks = s.tasks.map((x) => (x.id === id ? { ...x, completedHistory: hist, dueDate: next, status: 'open', completedAt: null } : x)); });
      showToast('success', 'Recurring task completed and advanced.');
    } else {
      patch((s) => { s.tasks = s.tasks.map((x) => (x.id === id ? { ...x, status: 'completed', completedAt: now } : x)); });
      showToast('success', 'Task marked complete.');
    }
  }, [patch]);

  const api: AimApi = { state, ready, patch, addTask, updateTask, deleteTask, completeTask, undo, redo };
  return <AimContext.Provider value={api}>{children}</AimContext.Provider>;
}
