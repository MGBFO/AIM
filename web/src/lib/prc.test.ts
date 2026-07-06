import { describe, it, expect } from 'vitest';
import { splitEnts, joinEnts, computeMostRecent, entityMostRecent, sortByProjected, flexPrivateFallback } from './prc';
import { EMPTY_MAPPING, type PrcArchive, type PrcMapping, type PrcSchedule } from './domain';

const arch = (p: Partial<PrcArchive>): PrcArchive => ({
  id: Math.random().toString(), meetingDate: null, macro: '', presentation: '', act40: '', hedgeFund: '', private: '', newFunds: '', sharepointUrl: '', ...p,
});

describe('splitEnts / joinEnts', () => {
  it('splits and joins on slash, trimming blanks', () => {
    expect(splitEnts('ETIHX / IPAY')).toEqual(['ETIHX', 'IPAY']);
    expect(joinEnts(['A', '', 'B'])).toBe('A/B');
  });
});

describe('computeMostRecent', () => {
  it('returns the latest archive meeting date for a presentation', () => {
    const archive = [
      arch({ presentation: 'Biotech', meetingDate: '2025-01-01' }),
      arch({ presentation: 'Biotech', meetingDate: '2026-03-12' }),
      arch({ presentation: 'Fintech', meetingDate: '2026-05-01' }),
    ];
    expect(computeMostRecent('Biotech', archive)).toBe('2026-03-12');
  });
});

describe('entityMostRecent', () => {
  it('finds the latest appearance within a slash-joined column', () => {
    const archive = [
      arch({ hedgeFund: 'Ikarian/SilverArc', meetingDate: '2025-05-01' }),
      arch({ hedgeFund: 'SilverArc', meetingDate: '2026-02-01' }),
    ];
    expect(entityMostRecent('SilverArc', 'hedgeFund', archive)).toBe('2026-02-01');
    expect(entityMostRecent('Ikarian', 'hedgeFund', archive)).toBe('2025-05-01');
  });
});

describe('sortByProjected', () => {
  it('sorts ascending by projectedNext, nulls last', () => {
    const rows = [
      { id: 'a', projectedNext: '2026-11-05' },
      { id: 'b', projectedNext: null },
      { id: 'c', projectedNext: '2026-06-01' },
    ] as PrcSchedule[];
    expect(sortByProjected(rows).map((r) => r.id)).toEqual(['c', 'a', 'b']);
  });
});

describe('flexPrivateFallback', () => {
  it('prefers a never-archived flex entity, else the oldest appearance', () => {
    const mapping: PrcMapping = {
      ...EMPTY_MAPPING,
      privateGlobal: [
        { name: 'Sabal', flex: true },
        { name: 'Thora', flex: true },
        { name: 'NonFlex', flex: false },
      ],
    };
    const archive = [arch({ private: 'Sabal', meetingDate: '2026-01-01' })];
    // Thora never archived -> highest priority
    expect(flexPrivateFallback(mapping, archive)).toBe('Thora');
  });
  it('returns null when no flex entities exist', () => {
    expect(flexPrivateFallback(EMPTY_MAPPING, [])).toBeNull();
  });
});
