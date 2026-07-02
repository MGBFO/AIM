import { describe, it, expect } from 'vitest';
import { nextSortDir, sortCaret, cmpVals, applyColSort } from './sort';

describe('nextSortDir', () => {
  it('cycles asc -> desc -> off for the same key', () => {
    let s = nextSortDir(null, 'city');
    expect(s).toEqual({ key: 'city', dir: 'asc' });
    s = nextSortDir(s, 'city');
    expect(s).toEqual({ key: 'city', dir: 'desc' });
    s = nextSortDir(s, 'city');
    expect(s).toEqual({ key: null, dir: null });
  });
  it('starts fresh at asc when switching keys', () => {
    expect(nextSortDir({ key: 'city', dir: 'desc' }, 'date')).toEqual({ key: 'date', dir: 'asc' });
  });
});

describe('sortCaret', () => {
  it('shows the right glyph', () => {
    expect(sortCaret({ key: 'a', dir: 'asc' }, 'a')).toBe('▲');
    expect(sortCaret({ key: 'a', dir: 'desc' }, 'a')).toBe('▼');
    expect(sortCaret({ key: 'a', dir: 'asc' }, 'b')).toBe('');
    expect(sortCaret(null, 'a')).toBe('');
  });
});

describe('cmpVals', () => {
  it('sorts nulls/blanks last', () => {
    expect(cmpVals(null, 5)).toBe(1);
    expect(cmpVals(5, null)).toBe(-1);
    expect(cmpVals('', '')).toBe(0);
  });
  it('numeric and natural string ordering', () => {
    expect(cmpVals(2, 10)).toBeLessThan(0);
    expect(cmpVals('Level 2', 'Level 10')).toBeLessThan(0);
  });
});

describe('applyColSort', () => {
  const rows = [{ n: 'b', v: 2 }, { n: 'a', v: null as number | null }, { n: 'c', v: 1 }];
  const get = (r: (typeof rows)[number], k: string) => (r as Record<string, unknown>)[k];
  it('sorts ascending with blanks last', () => {
    const out = applyColSort(rows, { key: 'v', dir: 'asc' }, get).map((r) => r.n);
    expect(out).toEqual(['c', 'b', 'a']);
  });
  it('returns input unchanged when dir is off', () => {
    expect(applyColSort(rows, { key: null, dir: null }, get)).toBe(rows);
  });
});
