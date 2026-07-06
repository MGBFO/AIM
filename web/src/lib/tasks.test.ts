import { describe, it, expect } from 'vitest';
import { toISO, todayLocal, addDaysISO } from './dates';
import {
  makeTask, getTaskSortGroup, sortTasksForAnalystSection, taskMatchesPeriodFilter,
  isTaskOverdue, normalizeImportedTasks,
} from './tasks';
import type { Task } from './domain';

const mk = (p: Partial<Task>): Task => makeTask(p);
const iso = (offsetDays: number) => addDaysISO(toISO(todayLocal()), offsetDays)!;

describe('makeTask', () => {
  it('applies defaults and dedupes Unassigned', () => {
    const t = mk({ title: 'x', dueDate: iso(1) });
    expect(t.label).toBe('Ad Hoc');
    expect(t.status).toBe('open');
    expect(t.analysts).toEqual(['Unassigned']);
    expect(t.sourceModule).toBe('Manual');
  });
  it('drops Unassigned when a real analyst is present', () => {
    expect(mk({ analysts: ['Unassigned', 'Mike Gregory'] }).analysts).toEqual(['Mike Gregory']);
  });
});

describe('getTaskSortGroup / sortTasksForAnalystSection', () => {
  it('orders overdue -> question -> recurring -> monitoring -> travel -> ad hoc -> DD -> completed', () => {
    const overdue = mk({ title: 'od', label: 'Ad Hoc', dueDate: iso(-2) });
    const q = mk({ title: 'q', label: 'Question', dueDate: iso(3) });
    const rec = mk({ title: 'r', label: 'Recurring', dueDate: iso(3) });
    const mon = mk({ title: 'm', label: 'Monitoring Calls', dueDate: iso(3) });
    const trav = mk({ title: 't', label: 'Travel', dueDate: iso(3) });
    const ad = mk({ title: 'a', label: 'Ad Hoc', dueDate: iso(3) });
    const dd = mk({ title: 'd', label: 'Due Diligence', dueDate: iso(3) });
    const done = mk({ title: 'c', label: 'Ad Hoc', status: 'completed', dueDate: iso(3) });
    expect(getTaskSortGroup(overdue)).toBe(0);
    expect(getTaskSortGroup(done)).toBe(7);
    const out = sortTasksForAnalystSection([done, dd, ad, trav, mon, rec, q, overdue]).map((t) => t.title);
    expect(out).toEqual(['od', 'q', 'r', 'm', 't', 'a', 'd', 'c']);
  });
});

describe('taskMatchesPeriodFilter', () => {
  it('matches the current month and All Time; excludes undated for periods', () => {
    const t = mk({ dueDate: iso(0) });
    expect(taskMatchesPeriodFilter(t, 'Current Month')).toBe(true);
    expect(taskMatchesPeriodFilter(mk({ dueDate: null }), 'Current Month')).toBe(false);
    expect(taskMatchesPeriodFilter(mk({ dueDate: null }), 'All Time')).toBe(true);
  });
});

describe('isTaskOverdue', () => {
  it('is true only for open, past-due tasks', () => {
    expect(isTaskOverdue(mk({ dueDate: iso(-1) }))).toBe(true);
    expect(isTaskOverdue(mk({ dueDate: iso(1) }))).toBe(false);
    expect(isTaskOverdue(mk({ dueDate: iso(-1), status: 'completed' }))).toBe(false);
  });
});

describe('normalizeImportedTasks', () => {
  it('maps legacy fields and counts missing due dates', () => {
    const { tasks, missing } = normalizeImportedTasks([
      { title: 'a', analyst: 'Team', sourceModule: 'Portfolio Research Committee', dueDate: iso(1) },
      { title: 'b', label: 'Bogus' },
    ]);
    expect(tasks[0].analysts).toEqual(['Unassigned']);
    expect(tasks[0].sourceModule).toBe('PRC');
    expect(tasks[1].label).toBe('Ad Hoc');
    expect(missing).toBe(1);
  });
});
