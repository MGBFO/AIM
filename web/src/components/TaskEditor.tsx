import { useState } from 'react';
import { toISO, formatDateMMDDYYYY } from '../lib/dates';
import { LABELS, SOURCES } from '../lib/tasks';
import { showToast } from '../lib/toast';
import { Modal } from './Modal';
import { AnalystPicker } from './AnalystPicker';
import type { Task } from '../lib/domain';
import type { AnalystName } from '../lib/roster';

export type EditableTask = Partial<Task> & { _new?: boolean };

export function TaskEditor({ task, onClose, onSave, onDelete }: {
  task: EditableTask;
  onClose: () => void;
  onSave: (t: EditableTask) => void;
  onDelete?: () => void;
}) {
  const [t, setT] = useState<EditableTask>({
    analysts: ['Unassigned'], label: 'Ad Hoc', recurrenceType: 'none', recurrenceUnit: 'months',
    recurrenceInterval: 1, sourceModule: 'Manual', createdBy: 'User', status: 'open', ...task,
  });
  const f = (k: keyof EditableTask, v: unknown) => setT((p) => ({ ...p, [k]: v }));
  const submit = () => {
    if (!t.title || !t.title.trim()) { showToast('error', 'Title is required.'); return; }
    if (!t.dueDate) { showToast('error', task._new ? 'Add a Due Date before creating this task.' : 'Add a Due Date before saving this task.'); return; }
    if (t.label === 'Recurring' && t.recurrenceType === 'none') { showToast('warning', 'Choose a recurrence type for a Recurring task.'); return; }
    onSave(t);
  };
  return (
    <Modal title={task._new ? 'New Task' : 'Edit Task'} onClose={onClose}
      foot={<>{onDelete && <button className="btn ghost" style={{ marginRight: 'auto' }} onClick={onDelete}>Delete</button>}
        <button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn gold" onClick={submit}>Save</button></>}>
      <div className="field"><label>Title *</label><input type="text" value={t.title || ''} onChange={(e) => f('title', e.target.value)} /></div>
      <div className="field"><label>Description</label><textarea value={t.description || ''} onChange={(e) => f('description', e.target.value)} /></div>
      <div className="field"><label>Analysts *</label><AnalystPicker value={t.analysts || ['Unassigned']} onChange={(v: AnalystName[]) => f('analysts', v)} /></div>
      <div className="grid2">
        <div className="field"><label>Label *</label><select value={t.label} onChange={(e) => f('label', e.target.value)}>{LABELS.map((l) => <option key={l}>{l}</option>)}</select></div>
        <div className="field"><label>Due Date *</label><input type="date" value={toISO(t.dueDate) || ''} onChange={(e) => f('dueDate', e.target.value)} /></div>
      </div>
      <div className="grid3">
        <div className="field"><label>Recurrence</label><select value={t.recurrenceType} onChange={(e) => f('recurrenceType', e.target.value)}><option value="none">none</option><option value="monthly">monthly</option><option value="quarterly">quarterly</option><option value="semiAnnual">semiAnnual</option><option value="annual">annual</option><option value="custom">custom</option></select></div>
        <div className="field"><label>Interval</label><input type="number" disabled={t.recurrenceType !== 'custom'} value={t.recurrenceInterval || ''} onChange={(e) => f('recurrenceInterval', +e.target.value)} /></div>
        <div className="field"><label>Unit</label><select disabled={t.recurrenceType !== 'custom'} value={t.recurrenceUnit || 'months'} onChange={(e) => f('recurrenceUnit', e.target.value)}><option>days</option><option>weeks</option><option>months</option><option>years</option></select></div>
      </div>
      <div className="grid2">
        <div className="field"><label>Source Module</label><select value={t.sourceModule} onChange={(e) => f('sourceModule', e.target.value)}>{SOURCES.map((s) => <option key={s}>{s}</option>)}</select></div>
        {task._new
          ? <div className="field"><label>Created By</label><input type="text" value={t.createdBy || 'User'} onChange={(e) => f('createdBy', e.target.value)} /></div>
          : <div className="field"><label>Status</label><select value={t.status} onChange={(e) => f('status', e.target.value)}><option value="open">open</option><option value="completed">completed</option></select></div>}
      </div>
      {!task._new && (
        <div className="mini" style={{ borderTop: '1px solid var(--line)', paddingTop: '8px' }}>
          Created: {formatDateMMDDYYYY(t.createdAt)} · Updated: {formatDateMMDDYYYY(t.updatedAt)}{t.completedAt ? ' · Completed: ' + formatDateMMDDYYYY(t.completedAt) : ''}
          {t.completedHistory && t.completedHistory.length > 0 && (
            <div style={{ marginTop: '6px' }}><b>Completed History</b>
              {t.completedHistory.map((h) => <div key={h.id} className="mini">• Due {formatDateMMDDYYYY(h.completedDueDate)} — completed {formatDateMMDDYYYY(h.completedAt)} by {h.completedBy}{h.note ? ' — ' + h.note : ''}</div>)}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
