import { describe, it, expect } from 'vitest';
import { reconcileTaskLinks } from './sync';
import type { AimState, Task, Trip, Monitoring } from './domain';

const task = (p: Partial<Task>): Task => ({
  id: 't1', title: '', description: '', analysts: ['Unassigned'], label: 'Monitoring Calls',
  dueDate: '2026-01-01', recurrenceType: 'none', recurrenceInterval: null, recurrenceUnit: null,
  status: 'open', sourceModule: 'Monitoring Process', sourceId: 'm1', completedAt: null,
  completedHistory: [], createdBy: 'User', ...p,
});
const mon = (p: Partial<Monitoring>): Monitoring => ({
  id: 'm1', fund: 'X', analyst: 'Unassigned', level: 'Level 1', mostRecent: null,
  monitoringDate: '2026-01-01', status: 'Not Started', annualOnsite: false, complianceCheck: false,
  targetMonitoringDays: 90, archived: false, ...p,
});
const trip = (p: Partial<Trip>): Trip => ({
  id: 'r1', section: 'upcoming', date: '2026-01-01', days: 1, city: 'NYC', analyst: 'MG',
  monitoringVisits: '', event: '', flight: null, hotel: null, car: null, notesOtherVisits: '',
  permanent: false, permanentOriginId: null, ...p,
});
const st = (o: Partial<AimState>): AimState => ({ tasks: [], trips: [], monitoring: [], ...o } as AimState);
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

describe('reconcileTaskLinks — monitoring', () => {
  it('task due-date change flows to the monitoring row', () => {
    const prev = st({ tasks: [task({})], monitoring: [mon({})] });
    const draft = clone(prev);
    draft.tasks[0].dueDate = '2026-03-01';
    reconcileTaskLinks(prev, draft);
    expect(draft.monitoring[0].monitoringDate).toBe('2026-03-01');
  });

  it('monitoring date change flows to the open task', () => {
    const prev = st({ tasks: [task({})], monitoring: [mon({})] });
    const draft = clone(prev);
    draft.monitoring[0].monitoringDate = '2026-04-15';
    reconcileTaskLinks(prev, draft);
    expect(draft.tasks[0].dueDate).toBe('2026-04-15');
  });

  it('task analyst change flows to the monitoring row', () => {
    const prev = st({ tasks: [task({ analysts: ['Unassigned'] })], monitoring: [mon({ analyst: 'Unassigned' })] });
    const draft = clone(prev);
    draft.tasks[0].analysts = ['Jack Griffin'];
    reconcileTaskLinks(prev, draft);
    expect(draft.monitoring[0].analyst).toBe('Jack Griffin');
  });

  it('completing the task marks the monitoring row Completed', () => {
    const prev = st({ tasks: [task({})], monitoring: [mon({ status: 'In Progress' })] });
    const draft = clone(prev);
    draft.tasks[0].status = 'completed';
    reconcileTaskLinks(prev, draft);
    expect(draft.monitoring[0].status).toBe('Completed');
  });

  it('setting the monitoring row Completed completes the open task', () => {
    const prev = st({ tasks: [task({})], monitoring: [mon({})] });
    const draft = clone(prev);
    draft.monitoring[0].status = 'Completed';
    reconcileTaskLinks(prev, draft);
    expect(draft.tasks[0].status).toBe('completed');
    expect(draft.tasks[0].completedAt).not.toBeNull();
  });

  it('leaves pre-existing drift alone when nothing changed this patch', () => {
    const prev = st({ tasks: [task({ dueDate: '2026-01-01' })], monitoring: [mon({ monitoringDate: '2025-12-01' })] });
    const draft = clone(prev);
    draft.tasks[0].title = 'edited something unrelated';
    reconcileTaskLinks(prev, draft);
    expect(draft.tasks[0].dueDate).toBe('2026-01-01');
    expect(draft.monitoring[0].monitoringDate).toBe('2025-12-01');
  });
});

describe('reconcileTaskLinks — travel', () => {
  it('task due-date change flows to the trip', () => {
    const prev = st({ tasks: [task({ sourceModule: 'Travel Schedule', sourceId: 'r1', label: 'Travel' })], trips: [trip({})] });
    const draft = clone(prev);
    draft.tasks[0].dueDate = '2026-05-20';
    reconcileTaskLinks(prev, draft);
    expect(draft.trips[0].date).toBe('2026-05-20');
  });

  it('trip analyst change flows to the open task', () => {
    const prev = st({ tasks: [task({ sourceModule: 'Travel Schedule', sourceId: 'r1', label: 'Travel', analysts: ['Mike Gregory'] })], trips: [trip({ analyst: 'MG' })] });
    const draft = clone(prev);
    draft.trips[0].analyst = 'JG';
    reconcileTaskLinks(prev, draft);
    expect(draft.tasks[0].analysts).toEqual(['Jack Griffin']);
  });
});
