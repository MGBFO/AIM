import { useState } from 'react';
import { toISO, todayLocal } from '../lib/dates';
import { showToast } from '../lib/toast';
import { Modal } from './Modal';

/**
 * "Record New Call" popup — captures Date + Name (and, when `analystOptions`
 * is supplied, the analyst the call belongs to). Shared by Analyst Bandwidth
 * (completing a New Calls task, analyst derived from the task) and the
 * Dashboard New Calls tray (standalone entry, analyst picked here), so the
 * recording surface behaves identically on both pages.
 */
export function NewCallPopup({ onClose, onSave, analystOptions }: {
  onClose: () => void;
  onSave: (v: { date: string; name: string; analyst?: string }) => void;
  analystOptions?: string[];
}) {
  const [date, setDate] = useState(toISO(todayLocal()) || '');
  const [name, setName] = useState('');
  const [analyst, setAnalyst] = useState(analystOptions?.[0] || '');
  const submit = () => {
    if (!date) { showToast('error', 'Pick a date for the call.'); return; }
    if (!name.trim()) { showToast('error', 'Enter a name for the call.'); return; }
    if (analystOptions && !analyst) { showToast('error', 'Choose an analyst for the call.'); return; }
    onSave({ date, name: name.trim(), analyst: analystOptions ? analyst : undefined });
  };
  return (
    <Modal title="Record New Call" onClose={onClose}
      foot={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn gold" onClick={submit}>Save</button></>}>
      <div className="grid2">
        <div className="field"><label>Date</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div className="field"><label>Name</label><input type="text" value={name} onChange={(e) => setName(e.target.value)} /></div>
      </div>
      {analystOptions && (
        <div className="field"><label>Analyst</label>
          <select value={analyst} onChange={(e) => setAnalyst(e.target.value)}>{analystOptions.map((a) => <option key={a}>{a}</option>)}</select>
        </div>
      )}
    </Modal>
  );
}
