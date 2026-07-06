import { useState } from 'react';
import { useAim } from '../hooks/useAim';
import { parseLocalDate, todayLocal, addDaysISO, formatDateMMDDYYYY } from '../lib/dates';
import { APPROVED_ANALYSTS, parseTravelAnalysts } from '../lib/roster';
import { isTaskOverdue, labelStyle } from '../lib/tasks';
import { showToast } from '../lib/toast';
import { Modal } from '../components/Modal';
import { Confirm } from '../components/Confirm';
import { TaskEditor } from '../components/TaskEditor';
import type { Task, Trip } from '../lib/domain';

type ConfirmState = { title: string; message: string; confirmLabel: string; onConfirm: () => void } | null;
const CAL_LABELS = ['Question', 'Recurring', 'Ad Hoc', 'Due Diligence', 'Monitoring Calls', 'Travel'];

function travelBarLabel(t: Trip): string {
  const city = (t.city || '').trim();
  const analyst = (t.analyst || '').trim();
  if (city) return city + ' - ' + (analyst || 'Unassigned');
  return 'Travel - ' + (analyst || 'Unassigned');
}

// On calendar chips the task type is already conveyed by the chip color, so we
// drop a leading "<type> — " prefix (e.g. "Monitoring Call — KIFYX" -> "KIFYX").
// Only recognized task-type prefixes are stripped, so a Travel task's legitimate
// "City — Event" title (an em dash between real content) is left intact.
const TASK_TYPE_PREFIXES = ['Monitoring Call', 'Monitoring Calls', 'Due Diligence', 'Question', 'Recurring', 'Ad Hoc'];
function calTaskTitle(title: string): string {
  const i = title.indexOf(' — ');
  if (i > 0 && TASK_TYPE_PREFIXES.includes(title.slice(0, i).trim())) return title.slice(i + 3).trim();
  return title;
}

interface TaskEvent { task: Task; date: string; done: boolean; ovr: boolean; hist?: boolean }
interface TripSeg { trip: Trip; isStart: boolean; isEnd: boolean; label: string }

export function Calendar() {
  const { state, updateTask, deleteTask, patch } = useAim();
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [cursor, setCursor] = useState(() => { const n = todayLocal(); return new Date(n.getFullYear(), n.getMonth(), 1); });
  const [fTask, setFTask] = useState('All Tasks');
  const [fAnalyst, setFAnalyst] = useState('All Analysts');
  const [detail, setDetail] = useState<Task | { __trip: Trip } | null>(null);

  const events: TaskEvent[] = [];
  (state.tasks || []).forEach((t) => {
    if (fTask !== 'All Tasks' && t.label !== fTask) return;
    if (fAnalyst !== 'All Analysts' && !t.analysts.includes(fAnalyst)) return;
    const dupTrip = t.sourceModule === 'Travel Schedule' && t.sourceId && (state.trips || []).some((tr) => tr.id === t.sourceId && tr.date && parseLocalDate(tr.date));
    if (dupTrip) return;
    if (t.dueDate) events.push({ task: t, date: t.dueDate, done: t.status === 'completed', ovr: isTaskOverdue(t) });
    (t.completedHistory || []).forEach((h) => { if (h.completedDueDate) events.push({ task: t, date: h.completedDueDate, done: true, ovr: false, hist: true }); });
  });

  const y = cursor.getFullYear();
  const mo = cursor.getMonth();
  const first = new Date(y, mo, 1);
  const startDow = first.getDay();
  const daysIn = new Date(y, mo + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysIn; d++) cells.push(d);
  const tdy = todayLocal();

  const showTravel = fTask === 'All Tasks' || fTask === 'Travel';
  const tripSegByDay: Record<number, TripSeg[]> = {};
  if (showTravel) {
    (state.trips || []).forEach((t) => {
      if (!t.date) return;
      const sd = parseLocalDate(t.date);
      if (!sd) return;
      if (fAnalyst !== 'All Analysts') { const al = parseTravelAnalysts(t.analyst); if (!al.includes(fAnalyst as never)) return; }
      const span = Math.max(1, t.days == null ? 1 : Math.round(Number(t.days) || 1));
      const start = new Date(sd.getFullYear(), sd.getMonth(), sd.getDate());
      for (let k = 0; k < span; k++) {
        const day = new Date(start);
        day.setDate(start.getDate() + k);
        if (day.getFullYear() === y && day.getMonth() === mo) {
          const dd = day.getDate();
          (tripSegByDay[dd] = tripSegByDay[dd] || []).push({ trip: t, isStart: k === 0, isEnd: k === span - 1, label: travelBarLabel(t) });
        }
      }
    });
  }

  const evFor = (d: number) => events.filter((e) => { const x = parseLocalDate(e.date); return x && x.getFullYear() === y && x.getMonth() === mo && x.getDate() === d; });
  const monthName = cursor.toLocaleString('en-US', { month: 'long', year: 'numeric' });

  return (
    <div className="module cal-module">
      <div className="module-head"><span className="module-title">Workflow Calendar</span>
        <span className="module-meta">Analyst Bandwidth tasks + Travel Schedule trips
          <span className="cal-travel-legend"><i></i> multi-day trip</span></span></div>
      <div className="ribbon">
        <button className="btn ghost" onClick={() => setCursor(new Date(y, mo - 1, 1))}>‹ Prev</button>
        <span style={{ fontFamily: "'Fraunces',serif", fontSize: '18px', fontWeight: 600, color: 'var(--navy)', minWidth: '180px', textAlign: 'center' }}>{monthName}</span>
        <button className="btn ghost" onClick={() => setCursor(new Date(y, mo + 1, 1))}>Next ›</button>
        <button className="btn ghost" onClick={() => { const n = todayLocal(); setCursor(new Date(n.getFullYear(), n.getMonth(), 1)); }}>Today</button>
        <div className="spacer"></div>
        <select className="inp-sm" value={fTask} onChange={(e) => setFTask(e.target.value)}><option>All Tasks</option>{CAL_LABELS.map((l) => <option key={l}>{l}</option>)}</select>
        <select className="inp-sm" value={fAnalyst} onChange={(e) => setFAnalyst(e.target.value)}><option>All Analysts</option>{APPROVED_ANALYSTS.map((a) => <option key={a}>{a}</option>)}</select>
      </div>
      <div className="cal-grid">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => <div key={d} className="cal-dow">{d}</div>)}
        {cells.map((d, i) => {
          if (d === null) return <div key={i} className="cal-cell out"></div>;
          const isToday = tdy.getFullYear() === y && tdy.getMonth() === mo && tdy.getDate() === d;
          const evs = evFor(d);
          const segs = tripSegByDay[d] || [];
          return (
            <div key={i} className={'cal-cell' + (isToday ? ' today' : '')}>
              <div className="cal-date">{d}</div>
              {segs.map((s, j) => {
                const dow = new Date(y, mo, d).getDay();
                const showText = s.isStart || dow === 0;
                const style: React.CSSProperties = {
                  left: s.isStart ? 4 : 0, right: s.isEnd ? 4 : 0,
                  borderTopLeftRadius: s.isStart ? 4 : 0, borderBottomLeftRadius: s.isStart ? 4 : 0,
                  borderTopRightRadius: s.isEnd ? 4 : 0, borderBottomRightRadius: s.isEnd ? 4 : 0,
                  top: (22 + j * 19) + 'px',
                };
                return <div key={'t' + j} className="cal-travelbar" style={style} title={s.label} onClick={() => setDetail({ __trip: s.trip })}>{showText ? s.label : ' '}</div>;
              })}
              <div className="cal-cell-tasks" style={{ marginTop: (segs.length ? segs.length * 19 + 4 : 0) + 'px' }}>
                {evs.map((e, j) => (
                  <div key={j} className={'cal-task' + (e.ovr ? ' ovr' : '') + (e.done ? ' done' : '')}
                    style={e.ovr ? { background: 'var(--red-bg)', color: 'var(--red)' } : labelStyle(e.task.label)}
                    onClick={() => setDetail(e.task)} title={e.task.title}>{e.done ? '✓ ' : ''}{calTaskTitle(e.task.title)}</div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {detail && '__trip' in detail && <TripDetail trip={detail.__trip} onClose={() => setDetail(null)} />}
      {detail && !('__trip' in detail) && <TaskEditor task={detail} onClose={() => setDetail(null)}
        onDelete={() => { const tk = detail; setConfirm({ title: 'Delete Task', message: 'Delete this task?', confirmLabel: 'Delete', onConfirm: () => { deleteTask(tk.id); setConfirm(null); setDetail(null); showToast('success', 'Task deleted.', { undo: () => { patch((s) => { if (!s.tasks.find((x) => x.id === tk.id)) s.tasks = [...s.tasks, tk]; }); } }); } }); }}
        onSave={(t) => { if (!t.dueDate) { showToast('error', 'Add a Due Date before saving this task.'); return; } updateTask(detail.id, t); setDetail(null); showToast('success', 'Task saved.'); }} />}
      {confirm && <Confirm {...confirm} onCancel={() => setConfirm(null)} />}
    </div>
  );
}

function TripDetail({ trip, onClose }: { trip: Trip; onClose: () => void }) {
  const span = Math.max(1, trip.days == null ? 1 : Math.round(Number(trip.days) || 1));
  const end = addDaysISO(trip.date, span - 1);
  const Row = ({ l, v }: { l: string; v: string }) => (
    <div style={{ display: 'flex', gap: 10, padding: '4px 0', fontSize: '13.5px' }}><span style={{ width: '130px', color: 'var(--muted)', fontWeight: 600 }}>{l}</span><span>{v || '-'}</span></div>
  );
  return (
    <Modal title="Travel Trip" onClose={onClose} foot={<button className="btn gold" onClick={onClose}>Close</button>}>
      <Row l="City" v={trip.city} /><Row l="Analyst" v={trip.analyst || 'Unassigned'} />
      <Row l="Dates" v={formatDateMMDDYYYY(trip.date) + (span > 1 ? ' – ' + formatDateMMDDYYYY(end) : '')} />
      <Row l="Days" v={trip.days == null ? '-' : String(trip.days)} />
      <Row l="Event/Conference" v={trip.event} /><Row l="Monitoring Visits" v={trip.monitoringVisits} />
      <Row l="Notes/Other" v={trip.notesOtherVisits} />
    </Modal>
  );
}
