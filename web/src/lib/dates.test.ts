import { describe, it, expect } from 'vitest';
import {
  parseLocalDate,
  toISO,
  formatDateMMDDYYYY,
  addDaysISO,
  addRecurringInterval,
  getLocalMonthRange,
  getLocalQuarterRange,
  inRange,
} from './dates';

describe('parseLocalDate', () => {
  it('parses yyyy-mm-dd as a local date with no UTC drift', () => {
    const d = parseLocalDate('2026-01-13')!;
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(0);
    expect(d.getDate()).toBe(13);
  });
  it('parses mm/dd/yyyy', () => {
    const d = parseLocalDate('3/1/2026')!;
    expect(toISO(d)).toBe('2026-03-01');
  });
  it('returns null for empty/invalid', () => {
    expect(parseLocalDate('')).toBeNull();
    expect(parseLocalDate(null)).toBeNull();
    expect(parseLocalDate(undefined)).toBeNull();
  });
});

describe('toISO / formatDateMMDDYYYY', () => {
  it('round-trips local ISO', () => {
    expect(toISO('2026-12-07')).toBe('2026-12-07');
  });
  it('formats mm/dd/yyyy with zero-padding', () => {
    expect(formatDateMMDDYYYY('2026-01-05')).toBe('01/05/2026');
    expect(formatDateMMDDYYYY(null)).toBe('-');
  });
});

describe('addDaysISO', () => {
  it('adds days across a month boundary', () => {
    expect(addDaysISO('2026-01-30', 5)).toBe('2026-02-04');
  });
});

describe('addRecurringInterval', () => {
  it('advances monthly, clamping to end of month', () => {
    expect(addRecurringInterval('2026-01-31', 'monthly')).toBe('2026-02-28');
  });
  it('advances quarterly / annual', () => {
    expect(addRecurringInterval('2026-01-15', 'quarterly')).toBe('2026-04-15');
    expect(addRecurringInterval('2026-01-15', 'annual')).toBe('2027-01-15');
  });
  it('handles custom weeks/years', () => {
    expect(addRecurringInterval('2026-01-01', 'custom', 2, 'weeks')).toBe('2026-01-15');
    expect(addRecurringInterval('2026-01-01', 'custom', 3, 'years')).toBe('2029-01-01');
  });
});

describe('ranges + inRange', () => {
  it('computes a month range and tests membership', () => {
    const r = getLocalMonthRange(parseLocalDate('2026-02-15')!);
    expect(toISO(r[0])).toBe('2026-02-01');
    expect(toISO(r[1])).toBe('2026-02-28');
    expect(inRange('2026-02-10', r)).toBe(true);
    expect(inRange('2026-03-01', r)).toBe(false);
  });
  it('computes a quarter range', () => {
    const r = getLocalQuarterRange(parseLocalDate('2026-05-15')!);
    expect(toISO(r[0])).toBe('2026-04-01');
    expect(toISO(r[1])).toBe('2026-06-30');
  });
});
