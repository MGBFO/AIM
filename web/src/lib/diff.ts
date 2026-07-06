/* Pure row-set diff by id — the basis for persisting a mutated state slice. */

export interface RowDiff<T> {
  inserts: T[];
  updates: T[];
  deletes: string[];
}

export function diffById<T extends { id: string }>(prev: T[], next: T[]): RowDiff<T> {
  const prevMap = new Map(prev.map((r) => [r.id, r]));
  const nextMap = new Map(next.map((r) => [r.id, r]));
  const inserts: T[] = [];
  const updates: T[] = [];
  const deletes: string[] = [];
  for (const [id, r] of nextMap) {
    const p = prevMap.get(id);
    if (!p) inserts.push(r);
    else if (JSON.stringify(p) !== JSON.stringify(r)) updates.push(r);
  }
  for (const id of prevMap.keys()) {
    if (!nextMap.has(id)) deletes.push(id);
  }
  return { inserts, updates, deletes };
}
