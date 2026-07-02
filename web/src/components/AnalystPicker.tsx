import { APPROVED_ANALYSTS, type AnalystName } from '../lib/roster';

interface AnalystPickerProps {
  value: string[];
  onChange: (v: AnalystName[]) => void;
}

/** Multi-select analyst chips. "Unassigned" is exclusive. Ported from spec. */
export function AnalystPicker({ value, onChange }: AnalystPickerProps) {
  const toggle = (a: AnalystName) => {
    let v: AnalystName[] = value.slice() as AnalystName[];
    if (a === 'Unassigned') {
      v = ['Unassigned'];
    } else {
      v = v.filter((x) => x !== 'Unassigned');
      v = v.includes(a) ? v.filter((x) => x !== a) : [...v, a];
      if (!v.length) v = ['Unassigned'];
    }
    onChange(v);
  };

  return (
    <div className="chips">
      {APPROVED_ANALYSTS.map((a) => (
        <button
          type="button"
          key={a}
          className={'chip' + (value.includes(a) ? ' on' : '')}
          onClick={() => toggle(a)}
        >
          {a}
        </button>
      ))}
    </div>
  );
}
