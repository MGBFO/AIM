import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { showToast } from '../lib/toast';
import { addRecurringInterval } from '../lib/dates';
import { uid } from '../lib/util';
import { makeTask } from '../lib/tasks';
import { buildDemoState } from '../lib/demoSeed';
import { DEMO_STORAGE_KEY } from '../lib/config';
import { AimContext, type AimApi } from '../hooks/useAim';
import { type AimState, type Task, EMPTY_MAPPING } from '../lib/domain';

const emptyState = (): AimState => ({
  trips: [], monitoring: [], prcSchedule: [], prcArchive: [], prcMapping: EMPTY_MAPPING,
  tasks: [], usefulLinks: [], monRollover: null, prefs: { abPeriod: 'Current Month' },
});

function loadInitial(): AimState {
  try {
    const raw = localStorage.getItem(DEMO_STORAGE_KEY);
    if (raw) return JSON.parse(raw) as AimState;
  } catch { /* ignore */ }
  return buildDemoState();
}

/**
 * DEMO backend: same AimApi as AimProvider, but state lives in memory and
 * persists to localStorage — no Supabase, no auth, single client (no realtime).
 * Lets anyone click through the full app with `npm run dev` and zero setup.
 */
export function DemoProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AimState>(emptyState);
  const [ready, setReady] = useState(false);
  const stateRef = useRef<AimState>(state);
  const undoStack = useRef<AimState[]>([]);
  const redoStack = useRef<AimState[]>([]);

  const commit = useCallback((next: AimState) => {
    stateRef.current = next;
    setState(next);
    try { localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore quota */ }
  }, []);

  useEffect(() => {
    const initial = loadInitial();
    stateRef.current = initial;
    setState(initial);
    setReady(true);
    showToast('info', 'Demo mode — data is stored locally in your browser.');
  }, []);

  const patch = useCallback((mutator: (s: AimState) => void) => {
    const prev = stateRef.current;
    const draft: AimState = structuredClone(prev);
    mutator(draft);
    undoStack.current.push(prev);
    if (undoStack.current.length > 80) undoStack.current.shift();
    redoStack.current = [];
    commit(draft);
  }, [commit]);

  const undo = useCallback(() => {
    if (!undoStack.current.length) { showToast('info', 'Nothing to undo.'); return; }
    const prev = undoStack.current.pop()!;
    redoStack.current.push(stateRef.current);
    commit(prev);
    showToast('info', 'Undo.');
  }, [commit]);

  const redo = useCallback(() => {
    if (!redoStack.current.length) { showToast('info', 'Nothing to redo.'); return; }
    const nxt = redoStack.current.pop()!;
    undoStack.current.push(stateRef.current);
    commit(nxt);
    showToast('info', 'Redo.');
  }, [commit]);

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
