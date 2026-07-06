import { toISO, type ISODate } from '../lib/dates';

interface DateCellProps {
  value: ISODate | null | undefined;
  onCommit: (value: ISODate | null) => void;
}

/**
 * Inline, in-place editable date cell. Uses a native date picker and stores the
 * local yyyy-mm-dd value with no UTC shift. Ported from spec.
 */
export function DateCell({ value, onCommit }: DateCellProps) {
  return (
    <input
      type="date"
      className="dcell"
      value={toISO(value) || ''}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => onCommit(e.target.value || null)}
    />
  );
}
