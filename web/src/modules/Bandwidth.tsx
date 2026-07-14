import { useEffect, useRef, useState } from 'react';
import { useAim } from '../hooks/useAim';
import { useSavedView } from '../hooks/useSavedView';
import { applyColSort, nextSortDir, sortCaret, type SortState } from '../lib/sort';
import { APPROVED_ANALYSTS } from '../lib/roster';
import { showToast } from '../lib/toast';
import { playBell } from '../lib/sound';
import { DateCell } from '../components/DateCell';
import { Confirm } from '../components/Confirm';
import { TaskEditor, type EditableTask } from '../components/TaskEditor';
import {
  LABELS, SOURCES, PERIODS, isTaskOverdue, isTaskDueThisWeek, isCompletedThisMonth,
  isOpenQuestionTask, taskMatchesPeriodFilter, sortTasksForAnalystSection, labelStyle,
  exportTasks, normalizeImportedTasks,
} from '../lib/tasks';
import type { Task } from '../lib/domain';

type ConfirmState = { title: string; message: string; confirmLabel: string; onConfirm: () => void } | null;

export function Bandwidth() {
  const { state, patch, addTask, updateTask, deleteTask, completeTask } = useAim();
  const { initial: savedView, saveView, setSaveView, save } = useSavedView('bandwidth');
  const [fAnalyst, setFAnalyst] = useState(savedView.on ? String(savedView.v.fAnalyst ?? 'All Analysts') : 'All Analysts');
  const [fLabel, setFLabel] = useState(savedView.on ? String(savedView.v.fLabel ?? 'All Labels') : 'All Labels');
  const [fStatus, setFStatus] = useState(savedView.on ? String(savedView.v.fStatus ?? 'All Statuses') : 'All Statuses');
  const [fSource, setFSource] = useState(savedView.on ? String(savedView.v.fSource ?? 'All Sources') : 'All Sources');
  const [period, setPeriod] = useState(savedView.on && savedView.v.period ? String(savedView.v.period) : (state.prefs.abPeriod || 'Current Month'));
  const [search, setSearch] = useState(savedView.on ? String(savedView.v.search ?? '') : '');
  const [edit, setEdit] = useState<EditableTask | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [sort, setSort] = useState<SortState>({ key: null, dir: null });
  const lastDel = useRef<Task | null>(null);
  const bwGet = (t: Task, k: string) => (k === '__status' ? (t.status === 'completed' ? 'Completed' : isTaskOverdue(t) ? 'Overdue' : 'Open') : t[k as keyof Task]);

  useEffect(() => {
    patch((s) => { s.prefs = { ...s.prefs, abPeriod: period }; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  useEffect(() => { save({ fAnalyst, fLabel, fStatus, fSource, period, search }); }, [save, fAnalyst, fLabel, fStatus, fSource, period, search]);

  const matches = (t: Task) => {
    if (fLabel !== 'All Labels' && t.label !== fLabel) return false;
    if (fSource !== 'All Sources' && t.sourceModule !== fSource) return false;
    if (fStatus !== 'All Statuses') {
      if (fStatus === 'Overdue') { if (!isTaskOverdue(t)) return false; }
      else if (fStatus === 'Open') { if (t.status !== 'open') return false; }
      else if (fStatus === 'Completed') { if (t.status !== 'completed') return false; }
    }
    if (!taskMatchesPeriodFilter(t, period)) return false;
    if (search) { const q = search.toLowerCase(); if (!(t.title || '').toLowerCase().includes(q) && !(t.description || '').toLowerCase().includes(q)) return false; }
    return true;
  };
  const filtered = state.tasks.filter(matches);
  const forAnalyst = (a: string) => filtered.filter((t) => t.analysts.includes(a));

  const globalSet = fAnalyst === 'All Analysts' ? filtered : filtered.filter((t) => t.analysts.includes(fAnalyst));
  const cOpen = globalSet.filter((t) => t.status === 'open').length;
  const cOverdue = globalSet.filter(isTaskOverdue).length;
  const cWeek = globalSet.filter(isTaskDueThisWeek).length;
  const cMonth = globalSet.filter(isCompletedThisMonth).length;
  const cQ = globalSet.filter(isOpenQuestionTask).length;

  const clearFilters = () => { setFAnalyst('All Analysts'); setFLabel('All Labels'); setFStatus('All Statuses'); setFSource('All Sources'); setSearch(''); setPeriod('Current Month'); };

  const onDelete = (t: Task) => setConfirm({
    title: 'Delete Task', message: 'Delete this task?', confirmLabel: 'Delete',
    onConfirm: () => {
      lastDel.current = t; deleteTask(t.id); setConfirm(null);
      showToast('success', 'Deleted selected task.', { undo: () => { patch((s) => { if (lastDel.current && !s.tasks.find((x) => x.id === lastDel.current!.id)) s.tasks = [...s.tasks, lastDel.current]; }); } });
    },
  });

  const visibleAnalysts = APPROVED_ANALYSTS.filter((a) => (fAnalyst === 'All Analysts' ? true : a === fAnalyst)).filter((a) => forAnalyst(a).length > 0);
  const anyTasks = visibleAnalysts.length > 0;

  const importTasks = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const { tasks, missing } = normalizeImportedTasks(JSON.parse(String(r.result)));
        patch((s) => { s.tasks = [...s.tasks, ...tasks]; });
        if (missing) showToast('warning', 'Some imported tasks are missing Due Dates.');
        else showToast('success', `Imported ${tasks.length} tasks.`);
      } catch (err) { console.error(err); showToast('error', 'Import failed: invalid file.'); }
    };
    r.readAsText(file);
  };

  const Card = ({ label, value, red, accent }: { label: string; value: number; red?: boolean; accent?: string }) => (
    <div className={'card ' + (accent || '')}><div className="label">{label}</div><div className={'value' + (red && value ? ' red' : '')}>{value}</div></div>
  );

  return (
    <div className="module">
      <div className="module-head"><span className="module-title">Analyst Bandwidth</span></div>
      <div className="cards">
        <Card label="Total Open Tasks" value={cOpen} accent="accent-gold" />
        <Card label="Total Overdue Tasks" value={cOverdue} red accent="accent-red" />
        <Card label="Due This Week" value={cWeek} accent="accent-blue" />
        <Card label="Completed This Month" value={cMonth} />
        <Card label="Open Questions" value={cQ} accent="accent-blue" />
      </div>
      <div className="ribbon">
        <button className="btn gold" onClick={() => setEdit({ _new: true, analysts: ['Unassigned'], label: 'Ad Hoc', status: 'open', recurrenceType: 'none', sourceModule: 'Manual', createdBy: 'User' })}>New Task</button>
        <select className="inp-sm" value={fAnalyst} onChange={(e) => setFAnalyst(e.target.value)}><option>All Analysts</option>{APPROVED_ANALYSTS.map((a) => <option key={a}>{a}</option>)}</select>
        <select className="inp-sm" value={fLabel} onChange={(e) => setFLabel(e.target.value)}><option>All Labels</option>{LABELS.map((l) => <option key={l}>{l}</option>)}</select>
        <select className="inp-sm" value={fStatus} onChange={(e) => setFStatus(e.target.value)}><option>All Statuses</option><option>Open</option><option>Completed</option><option>Overdue</option></select>
        <select className="inp-sm" value={fSource} onChange={(e) => setFSource(e.target.value)}><option>All Sources</option>{SOURCES.map((s) => <option key={s}>{s}</option>)}</select>
        <select className="inp-sm" value={period} onChange={(e) => setPeriod(e.target.value)}>{PERIODS.map((p) => <option key={p}>{p}</option>)}</select>
        <input className="inp-sm" style={{ width: '150px' }} placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <button className="btn ghost" onClick={clearFilters}>Clear Filters</button>
        <label className="save-view" title="Remember these filters on this device"><input type="checkbox" className="chk" checked={saveView} onChange={(e) => setSaveView(e.target.checked)} /> Save View</label>
        <div className="spacer"></div>
        <button className="btn ghost" onClick={() => exportTasks(state.tasks)}>Export</button>
        <label className="btn ghost" style={{ cursor: 'pointer' }}>Import<input type="file" accept=".json" style={{ display: 'none' }} onChange={importTasks} /></label>
      </div>

      {!anyTasks ? <div className="empty">No tasks match the current filters.</div> :
        visibleAnalysts.map((a) => {
          const tasks = applyColSort(sortTasksForAnalystSection(forAnalyst(a)), sort, bwGet);
          const open = tasks.filter((t) => t.status === 'open').length;
          const ovr = tasks.filter(isTaskOverdue).length;
          const wk = tasks.filter(isTaskDueThisWeek).length;
          const mo = tasks.filter(isCompletedThisMonth).length;
          return (
            <div className="analyst-card" key={a}>
              <div className="analyst-head">
                <span className="nm">{a}</span>
                <span className="mini"><b>{open}</b> open</span>
                <span className="mini r"><b>{ovr}</b> overdue</span>
                <span className="mini"><b>{wk}</b> due this week</span>
                <span className="mini"><b>{mo}</b> completed this month</span>
              </div>
              <div className="tbl-wrap" style={{ margin: 0, border: 'none', borderRadius: 0 }}><table>
                <thead><tr>
                  {(['title', 'label', 'dueDate', 'sourceModule', '__status'] as const).map((k, i) => (
                    <th key={k} className="srt" style={k === '__status' ? { width: '84px' } : undefined} onClick={() => setSort((s) => nextSortDir(s, k))}>
                      {['Title', 'Label', 'Due Date', 'Source', 'Status'][i]} <span className="car">{sortCaret(sort, k)}</span>
                    </th>
                  ))}
                  <th style={{ width: '180px' }}>Actions</th>
                </tr></thead>
                <tbody>{tasks.map((t) => { const isOvr = isTaskOverdue(t); const done = t.status === 'completed';
                  return (<tr key={t.id} className={done ? 'completed' : ''}>
                    <td className={'ttl' + (isOvr ? ' ovr' : '')} style={{ cursor: 'pointer', fontWeight: 600, maxWidth: '280px' }} onClick={() => setEdit(t)}>
                      {done && '✓ '}{t.title}
                      {t.analysts.length > 1 && <div className="shared-tag">Shared: {t.analysts.join(' / ')}</div>}</td>
                    <td><span className="lbl" style={labelStyle(t.label)}>{t.label}</span></td>
                    <td className={'nowrap' + (isOvr ? ' ovr' : '')} onClick={(e) => e.stopPropagation()}><DateCell value={t.dueDate} onCommit={(v) => { if (!v) { showToast('error', 'Due date is required.'); return; } updateTask(t.id, { dueDate: v }); }} /></td>
                    <td className="nowrap">{t.sourceModule}</td>
                    <td className="nowrap">{done ? <span className="pill green">Completed</span> : isOvr ? <span className="pill red">Overdue</span> : <span className="pill gray">Open</span>}</td>
                    <td className="nowrap" onClick={(e) => e.stopPropagation()}>
                      {!done && <button className="btn sm blue" onClick={() => { completeTask(t.id); playBell(); }}>Complete</button>}
                      <button className="btn sm ghost" style={{ marginLeft: '5px' }} onClick={() => onDelete(t)}>Delete</button>
                    </td>
                  </tr>); })}</tbody>
              </table></div>
            </div>
          );
        })}

      {edit && <TaskEditor task={edit} onClose={() => setEdit(null)}
        onSave={(t) => { if (edit._new) { const r = addTask(t); if (r) setEdit(null); } else { if (!t.dueDate) { showToast('error', 'Add a Due Date before saving this task.'); return; } updateTask(edit.id!, t); setEdit(null); showToast('success', 'Task saved.'); } }} />}
      {confirm && <Confirm {...confirm} onCancel={() => setConfirm(null)} />}
    </div>
  );
}
