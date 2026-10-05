import { describe, it, expect } from 'vitest';
import { toISO, todayLocal, addDaysISO } from './dates';
import { parseLevel, levelDays, monStatus, isMonOverdue, rolloverLabel, monitoringPeriodEndISO, excelToISO, parseMonitoringSheet, completeAndRollForwardMonitoringItem, defaultRolloverIso, rolloverValidation, applyRollover } from './monitoring';
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

describe('rolloverValidation — blockers vs non-blocking warnings', () => {
  const apr = '2026-04-01'; // Apr rollover applies to Level 1 only

  it('Completed with a valid Most Recent Date does not block or warn', () => {
    const recs = [mon({ status: 'Completed', mostRecent: '2026-01-15', monitoringDate: '2026-02-20' })];
    const v = rolloverValidation(recs, apr);
    expect(v.blockers).toHaveLength(0);
    expect(v.warnings).toHaveLength(0);
  });
  it('Completed with blank Most Recent but a Monitoring Date does not block', () => {
    const recs = [mon({ status: 'Completed', mostRecent: null, monitoringDate: '2026-02-20' })];
    expect(rolloverValidation(recs, apr).blockers).toHaveLength(0);
  });
  it('Completed missing BOTH dates is BLOCKED with a clear message', () => {
    const recs = [mon({ status: 'Completed', mostRecent: null, monitoringDate: null })];
    const b = rolloverValidation(recs, apr).blockers;
    expect(b).toHaveLength(1);
    expect(b[0].reason).toMatch(/no completion evidence/i);
  });

  it('a Monitoring Date mismatch is a non-blocking WARNING, not a blocker', () => {
    // expected = 2026-04-01 + 90 = 2026-06-30; record sits on a different date
    const mismatch = [mon({ status: 'In Progress', monitoringDate: '2026-07-12', targetMonitoringDays: 90 })];
    const v = rolloverValidation(mismatch, apr);
    expect(v.blockers).toHaveLength(0); // does NOT block
    expect(v.warnings).toHaveLength(1);
    expect(v.warnings[0].expected).toBe('2026-06-30');

    // already on its computed date -> no warning
    const exact = [mon({ status: 'Not Started', monitoringDate: '2026-06-30', targetMonitoringDays: 90 })];
    const v2 = rolloverValidation(exact, apr);
    expect(v2.blockers).toHaveLength(0);
    expect(v2.warnings).toHaveLength(0);

    // a blank Monitoring Date neither blocks nor warns
    const blank = [mon({ status: 'Not Started', monitoringDate: null })];
    const v3 = rolloverValidation(blank, apr);
    expect(v3.blockers).toHaveLength(0);
    expect(v3.warnings).toHaveLength(0);
  });

  it('a missing/invalid Target Monitoring Days BLOCKS', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bad = [mon({ status: 'Not Started', monitoringDate: '2026-06-30', targetMonitoringDays: null as any })];
    const b = rolloverValidation(bad, apr).blockers;
    expect(b).toHaveLength(1);
    expect(b[0].reason).toMatch(/Target Monitoring Days/i);
    // zero / negative also invalid
    expect(rolloverValidation([mon({ targetMonitoringDays: 0 })], apr).blockers).toHaveLength(1);
  });

  it('ignores out-of-scope levels and archived records', () => {
    const l2 = [mon({ level: 'Level 2', status: 'Completed', mostRecent: null, monitoringDate: null })];
    expect(rolloverValidation(l2, apr).blockers).toHaveLength(0); // Apr applies to Level 1 only
    const arch = [mon({ status: 'Completed', mostRecent: null, monitoringDate: null, archived: true })];
    expect(rolloverValidation(arch, apr).blockers).toHaveLength(0);
  });

  it('does not block a record whose Monitoring Date differs from a future Expected (10/13 vs 01/01+104)', () => {
    // 01/01/2027 + 104 = 04/15/2027; record currently on 10/13/2026 must not block
    const rec = [mon({ level: 'Level 1', status: 'In Progress', monitoringDate: '2026-10-13', targetMonitoringDays: 104 })];
    const v = rolloverValidation(rec, '2027-01-01');
    expect(v.blockers).toHaveLength(0);
    expect(v.warnings[0].expected).toBe('2027-04-15');
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

describe('custom targetMonitoringDays are preserved and drive the next cycle', () => {
  it('a custom Level 1 target (14) is an intentional offset — rollover does not normalize it', () => {
    // 07/01/2026 + 14 = 07/15/2026
    const recs = [mon({ level: 'Level 1', status: 'Completed', mostRecent: '2026-05-01', monitoringDate: '2026-06-17', targetMonitoringDays: 14 })];
    const out = applyRollover(recs, '2026-07-01');
    expect(out[0].targetMonitoringDays).toBe(14); // preserved, not overwritten to 90
    expect(out[0].monitoringDate).toBe('2026-07-15'); // rollover + its own target
    expect(out[0].status).toBe('Not Started');
    expect(out[0].mostRecent).toBe('2026-05-01'); // evidence kept
  });

  it('non-Completed validation uses the record’s own target (07/01 + 14 = 07/15)', () => {
    const match = [mon({ level: 'Level 1', status: 'In Progress', monitoringDate: '2026-07-15', targetMonitoringDays: 14 })];
    const v = rolloverValidation(match, '2026-07-01');
    expect(v.blockers).toHaveLength(0);
    expect(v.warnings).toHaveLength(0); // on its computed date -> no warning
    const off = [mon({ level: 'Level 1', status: 'In Progress', monitoringDate: '2026-08-01', targetMonitoringDays: 14 })];
    const v2 = rolloverValidation(off, '2026-07-01');
    expect(v2.blockers).toHaveLength(0); // mismatch does not block
    expect(v2.warnings[0].expected).toBe('2026-07-15');
  });

  it('rollover advances a 104-day offset record to 04/15/2027 (01/01/2027 + 104)', () => {
    const recs = [mon({ level: 'Level 1', status: 'In Progress', monitoringDate: '2026-10-13', targetMonitoringDays: 104 })];
    // Non-Completed records are left to their own next-date handling on rollover;
    // but the computed Expected is 04/15/2027 and it never blocks.
    expect(addDaysISO('2027-01-01', 104)).toBe('2027-04-15');
    const v = rolloverValidation(recs, '2027-01-01');
    expect(v.blockers).toHaveLength(0);
    expect(v.warnings[0].expected).toBe('2027-04-15');
    // a Completed 104-day record advances its Monitoring Date to 04/15/2027
    const done = [mon({ level: 'Level 1', status: 'Completed', mostRecent: '2026-06-01', monitoringDate: '2026-10-13', targetMonitoringDays: 104 })];
    const out = applyRollover(done, '2027-01-01');
    expect(out[0].monitoringDate).toBe('2027-04-15');
    expect(out[0].targetMonitoringDays).toBe(104);
    expect(out[0].status).toBe('Not Started');
  });

  it('records with different custom targets (55, 77) keep their own offsets', () => {
    const recs = [
      mon({ level: 'Level 1', status: 'Completed', mostRecent: '2026-05-01', targetMonitoringDays: 55 }),
      mon({ level: 'Level 2', status: 'Completed', mostRecent: '2026-05-01', targetMonitoringDays: 77 }),
    ];
    const out = applyRollover(recs, '2026-01-01'); // Jan applies to all levels
    expect(out[0].targetMonitoringDays).toBe(55);
    expect(out[0].monitoringDate).toBe(addDaysISO('2026-01-01', 55));
    expect(out[1].targetMonitoringDays).toBe(77);
    expect(out[1].monitoringDate).toBe(addDaysISO('2026-01-01', 77));
  });
});
