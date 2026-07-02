import { nextSortDir, sortCaret, type SortState } from '../lib/sort';

interface SortHeaderProps {
  sortKey: string;
  label: string;
  sort: SortState | null;
  onSort: (next: SortState) => void;
  className?: string;
}

/**
 * Sortable table header cell. Click cycles asc -> desc -> off and renders the
 * caret. Pairs with applyColSort in lib/sort. Ported from spec (th.srt).
 */
export function SortHeader({ sortKey, label, sort, onSort, className }: SortHeaderProps) {
  const caret = sortCaret(sort, sortKey);
  return (
    <th
      className={'srt' + (className ? ' ' + className : '')}
      onClick={() => onSort(nextSortDir(sort, sortKey))}
    >
      {label}
      {caret && <span className="car"> {caret}</span>}
    </th>
  );
}
