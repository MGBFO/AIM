import { describe, it, expect } from 'vitest';
import { toISO, todayLocal, addDaysISO } from './dates';
import { parseLevel, levelDays, monStatus, isMonOverdue, rolloverLabel, excelToISO, parseMonitoringSheet, completeAndRollForwardMonitoringItem } from './monitoring';
import type { Monitoring } from './domain';

const mon = (p: Partial<Monitoring>): Monitoring => ({
  id: 'm', fund: 'F', analyst: 'Unassigned', level: 'Level 1', mostRecent: null, monitoringDate: null,
  status: 'Not Started', annualOnsite: true, complianceCheck: true, targetMonitoringDays: 90, archived: false, ...p,
});

describe('level helpers', () => {
  it('strips BFO- prefix and maps target days', () => {
    expect(parseLevel('BFO - Level 2')).toBe('Level 2');
    expect(parseLevel('')).toBe('Level 1');
    expect(levelDays('Level 3')).toBe(365);
  });
});

describe('monStatus / isMonOverdue', () => {
  it('computes overdue from a past monitoring date', () => {
    const past = addDaysISO(toISO(todayLocal()), -1);
    expect(monStatus(mon({ monitoringDate: past }))).toBe('Overdue');
    expect(isMonOverdue(mon({ monitoringDate: past }))).toBe(true);
    expect(isMonOverdue(mon({ monitoringDate: past, archived: true }))).toBe(false);
    expect(monStatus(mon({ status: 'Completed', monitoringDate: past }))).toBe('Completed');
  });
});

describe('completeAndRollForwardMonitoringItem', () => {
  it('stamps Most Recent and advances Monitoring Date by Target days (no rollover base)', () => {
    const r = completeAndRollForwardMonitoringItem(mon({ monitoringDate: '2026-01-01', targetMonitoringDays: 90 }), null);
    expect(r.status).toBe('Completed');
    expect(r.mostRecent).toBe('2026-01-01');
    expect(r.monitoringDate).toBe(addDaysISO('2026-01-01', 90));
    expect(r.archived).toBe(false); // stays active
  });
  it('advances from the global rollover base when set', () => {
    const r = completeAndRollForwardMonitoringItem(mon({ monitoringDate: '2026-01-01', targetMonitoringDays: 180 }), '2026-07-01');
    expect(r.monitoringDate).toBe(addDaysISO('2026-07-01', 180));
    expect(r.mostRecent).toBe('2026-01-01');
  });
  it('uses the level-appropriate Target (L3 = 365)', () => {
    const r = completeAndRollForwardMonitoringItem(mon({ level: 'Level 3', monitoringDate: '2026-01-01', targetMonitoringDays: 365 }), null);
    expect(r.monitoringDate).toBe(addDaysISO('2026-01-01', 365));
  });
});

describe('rolloverLabel', () => {
  it('formats quarter + year', () => {
    expect(rolloverLabel('2026-07-01')).toBe('Q3 2026');
    expect(rolloverLabel(null)).toBe('Not Set');
  });
});

describe('excelToISO', () => {
  it('handles Date, ISO, US, and unparseable text', () => {
    expect(excelToISO(new Date(2026, 0, 5)).iso).toBe('2026-01-05');
    expect(excelToISO('2026-3-7').iso).toBe('2026-03-07');
    expect(excelToISO('3/7/26').iso).toBe('2026-03-07');
    const bad = excelToISO('sometime Q2');
    expect(bad.iso).toBeNull();
    expect(bad.text).toBe('sometime Q2');
  });
});

describe('parseMonitoringSheet', () => {
  it('parses rows, fills analyst down, strips BFO- level', () => {
    const aoa: unknown[][] = [
      ['Analyst', 'Fund', 'Monitoring Level', 'Most Recent', 'Monitoring Date', 'Target Days'],
      ['MG', 'Acore', 'BFO - Level 1', '2026-04-13', '2026-07-12', 90],
      ['', 'Appian', 'BFO - Level 2', '', '', ''], // analyst fills down from MG
      ['', '', '', '', '', ''], // blank -> skipped silently
    ];
    const { records, diag, headerFound } = parseMonitoringSheet(aoa);
    expect(headerFound).toBe(true);
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({ fund: 'Acore', analyst: 'Mike Gregory', level: 'Level 1', monitoringDate: '2026-07-12' });
    expect(records[1]).toMatchObject({ fund: 'Appian', analyst: 'Mike Gregory', level: 'Level 2', targetMonitoringDays: 180 });
    expect(diag.imported).toBe(2);
  });
  it('reports when no Fund column exists', () => {
    const { headerFound } = parseMonitoringSheet([['x', 'y'], ['1', '2']]);
    expect(headerFound).toBe(false);
  });
});
