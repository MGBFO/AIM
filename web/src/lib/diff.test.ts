import { describe, it, expect } from 'vitest';
import { diffById } from './diff';

describe('diffById', () => {
  it('detects inserts, updates, and deletes', () => {
    const prev = [
      { id: 'a', v: 1 },
      { id: 'b', v: 2 },
      { id: 'c', v: 3 },
    ];
    const next = [
      { id: 'a', v: 1 }, // unchanged
      { id: 'b', v: 20 }, // changed
      { id: 'd', v: 4 }, // new
    ];
    const d = diffById(prev, next);
    expect(d.inserts.map((r) => r.id)).toEqual(['d']);
    expect(d.updates.map((r) => r.id)).toEqual(['b']);
    expect(d.deletes.sort()).toEqual(['c']);
  });

  it('is empty when nothing changed', () => {
    const rows = [{ id: 'a', v: 1 }];
    const d = diffById(rows, [{ id: 'a', v: 1 }]);
    expect(d.inserts).toHaveLength(0);
    expect(d.updates).toHaveLength(0);
    expect(d.deletes).toHaveLength(0);
  });
});
