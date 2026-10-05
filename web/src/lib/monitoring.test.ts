import { describe, it, expect } from 'vitest';
import { toISO, todayLocal, addDaysISO } from './dates';
import { parseLevel, levelDays, monStatus, isMonOverdue, rolloverLabel, monitoringPeriodEndISO, excelToISO, parseMonitoringSheet, completeAndRollForwardMonitoringItem, defaultRolloverIso, rolloverNonCompliant, applyRollover, repairTargetDays, repairTargetDaysDiag } from './monitoring';
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

describe('monitoringPeriodEndISO', () => {
  it('returns the next rollover boundary per level (mid-quarter)', () => {
    const aug = new Date(2026, 7, 15); // Aug 15, 2026
    expect(monitoringPeriodEndISO('Level 1', aug)).toBe('2026-10-01'); // next quarter start
    expect(monitoringPeriodEndISO('Level 2', aug)).toBe('2027-01-01'); // next Jan/Jul boundary
    expect(monitoringPeriodEndISO('Level 3', aug)).toBe('2027-01-01'); // next Jan 1
  });
  it('rolls to the following year when past the last boundary', () => {
    const nov = new Date(2026, 10, 3); // Nov 3, 2026
    expect(monitoringPeriodEndISO('Level 1', nov)).toBe('2027-01-01');
  });
  it('uses the strictly-next boundary when today is on a boundary', () => {
    const jul1 = new Date(2026, 6, 1); // Jul 1, 2026
    expect(monitoringPeriodEndISO('Level 1', jul1)).toBe('2026-10-01');
    expect(monitoringPeriodEndISO('Level 2', jul1)).toBe('2027-01-01');
  });
});

describe('rolloverLabel', () => {
  it('formats quarter + year', () => {
    expect(rolloverLabel('2026-07-01')).toBe('Q3 2026');
    expect(rolloverLabel(null)).toBe('Not Set');
  });
});

describe('defaultRolloverIso', () => {
  it('defaults to the next rollover date on or after today', () => {
    expect(defaultRolloverIso('2026-10-05', 2026)).toBe('2027-01-01'); // after 10/01, before year end
    expect(defaultRolloverIso('2026-03-15', 2026)).toBe('2026-04-01'); // before the first date
    expect(defaultRolloverIso('2026-12-31', 2026)).toBe('2027-01-01'); // after all current-year dates
  });
  it('includes and defaults to today when today is exactly a rollover date', () => {
    expect(defaultRolloverIso('2026-07-01', 2026)).toBe('2026-07-01');
    expect(defaultRolloverIso('2026-04-01', 2026)).toBe('2026-04-01');
  });
});

describe('rolloverNonCompliant — Completed-status validation', () => {
  const apr = '2026-04-01'; // Apr rollover applies to Level 1 only

  it('Completed with a valid Most Recent Date does not block', () => {
    const recs = [mon({ status: 'Completed', mostRecent: '2026-01-15', monitoringDate: '2026-02-20' })];
    expect(rolloverNonCompliant(recs, apr)).toHaveLength(0);
  });
  it('Completed with blank Most Recent but a Monitoring Date does not block', () => {
    const recs = [mon({ status: 'Completed', mostRecent: null, monitoringDate: '2026-02-20' })];
    expect(rolloverNonCompliant(recs, apr)).toHaveLength(0);
  });
  it('Completed missing BOTH dates is blocked with a clear message', () => {
    const recs = [mon({ status: 'Completed', mostRecent: null, monitoringDate: null })];
    const bad = rolloverNonCompliant(recs, apr);
    expect(bad).toHaveLength(1);
    expect(bad[0].expected).toBeNull();
    expect(bad[0].reason).toMatch(/no completion evidence/i);
  });

  it('non-Completed keeps the existing expected-date rule (rollover + Target Days)', () => {
    // expected = 2026-04-01 + 90 = 2026-06-30
    const mismatch = [mon({ status: 'In Progress', monitoringDate: '2026-07-12', targetMonitoringDays: 90 })];
    const bad = rolloverNonCompliant(mismatch, apr);
    expect(bad).toHaveLength(1);
    expect(bad[0].expected).toBe('2026-06-30');

    const exact = [mon({ status: 'Not Started', monitoringDate: '2026-06-30', targetMonitoringDays: 90 })];
    expect(rolloverNonCompliant(exact, apr)).toHaveLength(0);

    // a blank Monitoring Date is not flagged under the current rule
    const blank = [mon({ status: 'Not Started', monitoringDate: null })];
    expect(rolloverNonCompliant(blank, apr)).toHaveLength(0);
  });

  it('ignores out-of-scope levels and archived records', () => {
    const l2 = [mon({ level: 'Level 2', status: 'Completed', mostRecent: null, monitoringDate: null })];
    expect(rolloverNonCompliant(l2, apr)).toHaveLength(0); // Apr applies to Level 1 only
    const arch = [mon({ status: 'Completed', mostRecent: null, monitoringDate: null, archived: true })];
    expect(rolloverNonCompliant(arch, apr)).toHaveLength(0);
  });
});

describe('applyRollover', () => {
  const apr = '2026-04-01';
  const oct = '2026-10-01';
  const jan = '2026-01-01';

  it('resets Completed records to Not Started, preserves Most Recent, and advances Monitoring Date', () => {
    // apr + 90 days = 2026-06-30
    const recs = [mon({ status: 'Completed', mostRecent: '2026-01-15', monitoringDate: '2026-03-01' })];
    const out = applyRollover(recs, apr);
    expect(out[0].status).toBe('Not Started');
    expect(out[0].mostRecent).toBe('2026-01-15'); // populated evidence unchanged
    expect(out[0].monitoringDate).toBe('2026-06-30'); // advanced to next cycle (rollover + Target)
  });
  it('carries a blank Most Recent from the old Monitoring Date, then advances Monitoring Date', () => {
    // 10/01/2026 + 90 = 12/30/2026
    const recs = [mon({ status: 'Completed', mostRecent: null, monitoringDate: '2026-07-13', targetMonitoringDays: 90 })];
    const out = applyRollover(recs, oct);
    expect(out[0].mostRecent).toBe('2026-07-13'); // old date kept as completion evidence
    expect(out[0].monitoringDate).toBe('2026-12-30'); // next required date
    expect(out[0].status).toBe('Not Started');
  });
  it('rolled-over Completed records are not immediately Overdue (new date is in the future)', () => {
    // today is 2026-10-05 in this suite's environment; new date 12/30/2026 > today
    const recs = [mon({ status: 'Completed', mostRecent: null, monitoringDate: '2026-07-13', targetMonitoringDays: 90 })];
    const out = applyRollover(recs, oct);
    expect(monStatus(out[0])).toBe('Not Started');
    expect(monStatus(out[0])).not.toBe('Overdue');
  });
  it('clears Annual Onsite / Compliance Check for Level 1 only on the Jan 1 boundary', () => {
    const recs = [mon({ level: 'Level 1', status: 'Completed', mostRecent: '2026-01-10', annualOnsite: true, complianceCheck: true })];
    expect(applyRollover(recs, jan)[0].annualOnsite).toBe(false);
    expect(applyRollover(recs, jan)[0].complianceCheck).toBe(false);
    // Apr boundary leaves them untouched
    expect(applyRollover(recs, apr)[0].annualOnsite).toBe(true);
  });
  it('leaves archived and out-of-scope records untouched', () => {
    const arch = mon({ status: 'Completed', archived: true, mostRecent: '2026-01-10' });
    expect(applyRollover([arch], apr)[0]).toEqual(arch);
    const l2 = mon({ level: 'Level 2', status: 'Completed', mostRecent: '2026-01-10' });
    expect(applyRollover([l2], apr)[0].status).toBe('Completed'); // Apr applies to Level 1 only
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

describe('repairTargetDays / repairTargetDaysDiag', () => {
  it('repairs bad Level 1 targets (14/55/77) to 90, L2 to 180, L3 to 365', () => {
    const recs = [
      mon({ fund: 'A', level: 'Level 1', targetMonitoringDays: 14 }),
      mon({ fund: 'B', level: 'Level 1', targetMonitoringDays: 55 }),
      mon({ fund: 'C', level: 'Level 1', targetMonitoringDays: 77 }),
      mon({ fund: 'D', level: 'Level 2', targetMonitoringDays: 90 }),
      mon({ fund: 'E', level: 'Level 3', targetMonitoringDays: 90 }),
    ];
    const out = repairTargetDays(recs);
    expect(out.map((m) => m.targetMonitoringDays)).toEqual([90, 90, 90, 180, 365]);
  });

  it('does not change dates, status, onsite/compliance, archived, or other fields', () => {
    const r = mon({ fund: 'Acore', analyst: 'Mike Gregory', level: 'Level 1', targetMonitoringDays: 14, mostRecent: '2026-01-15', monitoringDate: '2026-07-13', status: 'Completed', annualOnsite: true, complianceCheck: true, archived: true });
    const out = repairTargetDays([r])[0];
    expect(out.targetMonitoringDays).toBe(90);
    expect(out).toMatchObject({ fund: 'Acore', analyst: 'Mike Gregory', level: 'Level 1', mostRecent: '2026-01-15', monitoringDate: '2026-07-13', status: 'Completed', annualOnsite: true, complianceCheck: true, archived: true });
  });

  it('leaves records already at the level standard untouched (same object reference)', () => {
    const good = mon({ level: 'Level 1', targetMonitoringDays: 90 });
    const out = repairTargetDays([good]);
    expect(out[0]).toBe(good); // unchanged reference
  });

  it('diagnostic counts only records that will change, by level', () => {
    const recs = [
      mon({ level: 'Level 1', targetMonitoringDays: 14 }),
      mon({ level: 'Level 1', targetMonitoringDays: 90 }), // already ok
      mon({ level: 'Level 2', targetMonitoringDays: 77 }),
      mon({ level: 'Level 3', targetMonitoringDays: 365 }), // already ok
    ];
    expect(repairTargetDaysDiag(recs)).toEqual({ l1: 1, l2: 1, l3: 0, total: 2 });
  });

  it('after repair, a 10/01/2026 Level 1 record expects 12/30/2026', () => {
    const repaired = repairTargetDays([mon({ level: 'Level 1', targetMonitoringDays: 14 })])[0];
    expect(repaired.targetMonitoringDays).toBe(90);
    expect(addDaysISO('2026-10-01', repaired.targetMonitoringDays)).toBe('2026-12-30');
  });
});
