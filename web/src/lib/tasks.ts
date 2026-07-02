/* ============================================================================
   Task helpers — ported from the spec. Sort groups, period filters, recurrence
   completion, and JSON import/export for Analyst Bandwidth.
   ========================================================================== */
import {
  parseLocalDate, todayLocal, toISO, inRange,
  getLocalMonthRange, getLocalQuarterRange, getLocalYearRange,
  getNextLocalMonthRange, getNextLocalQuarterRange, getNextLocalYearRange,
} from './dates';
import { APPROVED_ANALYSTS } from './roster';
import { uid } from './util';
import { download } from './format';
import type { Task } from './domain';

export const LABELS = ['Question', 'Recurring', 'Ad Hoc', 'Due Diligence', 'Monitoring Calls', 'Travel'];
export const SOURCES = ['Manual', 'Travel Schedule', 'Monitoring Process', 'PRC', 'Other'];
export const PERIODS = ['All Time', 'Current Month', 'Current Quarter', 'Current Year', 'Next Month', 'Next Quarter', 'Next Year'];

const APPROVED = APPROVED_ANALYSTS as readonly string[];

export function makeTask(p: Partial<Task>): Task {
  const now = new Date().toISOString();
  let analysts = (p.analysts && p.analysts.length ? p.analysts : ['Unassigned']).filter((a) => APPROVED.includes(a));
  if (!analysts.length) analysts = ['Unassigned'];
  if (analysts.length > 1) analysts = analysts.filter((a) => a !== 'Unassigned');
  if (!analysts.length) analysts = ['Unassigned'];
  return {
    id: uid('task'), title: p.title || '', description: p.description || '', analysts,
    label: p.label || 'Ad Hoc', dueDate: p.dueDate || null,
    recurrenceType: p.recurrenceType || 'none', recurrenceInterval: p.recurrenceInterval || null,
    recurrenceUnit: p.recurrenceUnit || null, status: p.status || 'open',
    sourceModule: p.sourceModule || 'Manual', sourceId: p.sourceId || null,
    completedAt: null, completedHistory: [], createdAt: now, updatedAt: now,
    createdBy: p.createdBy || 'User',
  };
}

export function isTaskOverdue(t: Task): boolean {
  if (t.status !== 'open' || !t.dueDate) return false;
  return parseLocalDate(t.dueDate)! < todayLocal();
}
export function isTaskDueThisWeek(t: Task): boolean {
  if (t.status !== 'open' || !t.dueDate) return false;
  const d = parseLocalDate(t.dueDate)!;
  const tdy = todayLocal();
  const end = new Date(tdy);
  end.setDate(tdy.getDate() + 7);
  return d >= tdy && d <= end;
}
export function isCompletedThisMonth(t: Task): boolean {
  const r = getLocalMonthRange();
  if (t.status === 'completed' && t.completedAt && inRange(t.completedAt.slice(0, 10), r)) return true;
  if (t.completedHistory) return t.completedHistory.some((h) => h.completedAt && inRange(h.completedAt.slice(0, 10), r));
  return false;
}
export function isOpenQuestionTask(t: Task): boolean {
  return t.status === 'open' && t.label === 'Question';
}
export function taskMatchesPeriodFilter(t: Task, period: string): boolean {
  if (period === 'All Time') return true;
  if (!t.dueDate) return false;
  let r;
  if (period === 'Current Month') r = getLocalMonthRange();
  else if (period === 'Current Quarter') r = getLocalQuarterRange();
  else if (period === 'Current Year') r = getLocalYearRange();
  else if (period === 'Next Month') r = getNextLocalMonthRange();
  else if (period === 'Next Quarter') r = getNextLocalQuarterRange();
  else if (period === 'Next Year') r = getNextLocalYearRange();
  else return true;
  return inRange(t.dueDate, r);
}

const SORT_GROUP: Record<string, number> = {
  Question: 1, Recurring: 2, 'Monitoring Calls': 3, Travel: 4, 'Ad Hoc': 5, 'Due Diligence': 6,
};
export function getTaskSortGroup(t: Task): number {
  if (t.status === 'completed') return 7;
  if (isTaskOverdue(t)) return 0;
  return SORT_GROUP[t.label] != null ? SORT_GROUP[t.label] : 5;
}
export function sortTasksForAnalystSection(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    const ga = getTaskSortGroup(a);
    const gb = getTaskSortGroup(b);
    if (ga !== gb) return ga - gb;
    if (ga === 7) {
      const ca = a.completedAt || '';
      const cb = b.completedAt || '';
      if (ca && cb && ca !== cb) return cb.localeCompare(ca);
      if (ca && !cb) return -1;
      if (!ca && cb) return 1;
    }
    const da = a.dueDate ? parseLocalDate(a.dueDate)!.getTime() : Infinity;
    const db = b.dueDate ? parseLocalDate(b.dueDate)!.getTime() : Infinity;
    if (da !== db) return da - db;
    return (a.title || '').localeCompare(b.title || '');
  });
}

export function labelStyle(l: string): { background: string; color: string } {
  const m: Record<string, [string, string]> = {
    Question: ['--question-bg', '--question-tx'], Recurring: ['--green-bg', '--green-tx'],
    'Ad Hoc': ['--yellow-bg', '--yellow-tx'], 'Due Diligence': ['--teal-bg', '--teal-tx'],
    'Monitoring Calls': ['--orange-bg', '--orange-tx'], Travel: ['--bluegray-bg', '--bluegray-tx'],
  };
  const [bg, tx] = m[l] || ['--line-2', '--muted'];
  return { background: `var(${bg})`, color: `var(${tx})` };
}

export function exportTasks(tasks: Task[]): void {
  download('AIM_Analyst_Bandwidth_' + toISO(todayLocal()) + '.json', JSON.stringify(tasks, null, 2), 'application/json');
}

/** Normalize an array of imported task objects into valid Task records. */
export function normalizeImportedTasks(arr: unknown): { tasks: Task[]; missing: number } {
  if (!Array.isArray(arr)) throw new Error('bad');
  let missing = 0;
  const tasks = arr.map((raw) => {
    const t = raw as Record<string, unknown>;
    const nt = makeTask({ ...(t as Partial<Task>), dueDate: (t.dueDate as string) || null });
    Object.assign(nt, t);
    if (!Array.isArray(nt.analysts)) {
      const a = t.analyst as string;
      nt.analysts = [a === 'Team' ? 'Unassigned' : APPROVED.includes(a) ? a : 'Unassigned'];
    }
    nt.analysts = nt.analysts.filter((a) => APPROVED.includes(a));
    if (!nt.analysts.length) nt.analysts = ['Unassigned'];
    if (nt.sourceModule === 'Portfolio Research Committee') nt.sourceModule = 'PRC';
    if (!LABELS.includes(nt.label)) nt.label = 'Ad Hoc';
    if (!nt.dueDate) missing++;
    if (!nt.completedHistory) nt.completedHistory = [];
    return nt;
  });
  return { tasks, missing };
}
