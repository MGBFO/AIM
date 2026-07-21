import { useEffect, useMemo, useState } from 'react';
import { useAim } from '../hooks/useAim';
import { useSavedView } from '../hooks/useSavedView';
import { toISO, parseLocalDate, todayLocal, addDaysISO, formatDateMMDDYYYY, getLocalMonthRange, inRange } from '../lib/dates';
import { applyColSort, nextSortDir, sortCaret, type SortState } from '../lib/sort';
import { APPROVED_ANALYSTS } from '../lib/roster';
import { uid } from '../lib/util';
import { showToast } from '../lib/toast';
import {
  levelDays, monStatus, isMonOverdue, rolloverLabel, exportMonitoring, exportMonitoringXlsx,
  readMonitoringWorkbook, parseMonitoringSheet, parseCsv, completeAndRollForwardMonitoringItem, type ImportDiag,
} from '../lib/monitoring';
import { DateCell } from '../components/DateCell';
import { Modal } from '../components/Modal';
import { Confirm } from '../components/Confirm';
import type { Monitoring } from '../lib/domain';
import type { MonitoringLevel } from '../lib/types';

type ConfirmState = { title: string; message: string; confirmLabel: string; onConfirm: () => void } | null;
const LEVELS: MonitoringLevel[] = ['Level 1', 'Level 2', 'Level 3'];
const COLS = ['Fund', 'Analyst', 'Monitoring Level', 'Most Recent Date', 'Monitoring Date', 'Status', 'Annual Onsite', 'Compliance Check'];
const MON_KEY: Record<string, string> = {
  Fund: 'fund', Analyst: 'analyst', 'Monitoring Level': 'level', 'Most Recent Date': 'mostRecent',
  'Monitoring Date': 'monitoringDate', Status: '__status', 'Annual Onsite': 'annualOnsite', 'Compliance Check': 'complianceCheck',
};

export function Monitoring() {
  const { state, patch, addTask } = useAim();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [editRec, setEditRec] = useState<Partial<Monitoring> | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [rollover, setRollover] = useState(false);
  const [bulk, setBulk] = useState(false);
  const { initial: savedView, saveView, setSaveView, save } = useSavedView('monitoring');
  const [fAnalyst, setFAnalyst] = useState(savedView.on ? String(savedView.v.fAnalyst ?? 'All') : 'All');
  const [fLevel, setFLevel] = useState(savedView.on ? String(savedView.v.fLevel ?? 'All') : 'All');
  const [fStatus, setFStatus] = useState(savedView.on ? String(savedView.v.fStatus ?? 'All') : 'All');
  const [search, setSearch] = useState(savedView.on ? String(savedView.v.search ?? '') : '');
  const [importDiag, setImportDiag] = useState<ImportDiag | null>(null);
  const [sort, setSort] = useState<SortState>({ key: null, dir: null });

  useEffect(() => { save({ fAnalyst, fLevel, fStatus, search }); }, [save, fAnalyst, fLevel, fStatus, search]);

  const setMon = (mapper: (list: Monitoring[]) => Monitoring[]) => patch((s) => { s.monitoring = mapper(s.monitoring); });
  const monGet = (m: Monitoring, k: string) => (k === '__status' ? monStatus(m) : m[k as keyof Monitoring]);

  const active = state.monitoring.filter((m) => !m.archived);
  const levelOrder: Record<string, number> = { 'Level 1': 0, 'Level 2': 1, 'Level 3': 2 };
  const baseRows = active
    .filter((m) => {
      if (fAnalyst !== 'All' && m.analyst !== fAnalyst) return false;
      if (fLevel !== 'All' && m.level !== fLevel) return false;
      if (fStatus !== 'All') { if (fStatus === 'Overdue') { if (monStatus(m) !== 'Overdue') return false; } else if (monStatus(m) !== fStatus) return false; }
      if (search && !(m.fund || '').toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    })
    .sort((a, b) => {
      const lo = (levelOrder[a.level] ?? 9) - (levelOrder[b.level] ?? 9);
      if (lo !== 0) return lo;
      const ta = a.monitoringDate ? parseLocalDate(a.monitoringDate)!.getTime() : Infinity;
      const tb = b.monitoringDate ? parseLocalDate(b.monitoringDate)!.getTime() : Infinity;
      if (ta !== tb) return ta - tb;
      const ra = a.mostRecent ? parseLocalDate(a.mostRecent)!.getTime() : Infinity;
      const rb = b.mostRecent ? parseLocalDate(b.mostRecent)!.getTime() : Infinity;
      return ra - rb;
    });
  const rows = applyColSort(baseRows, sort, monGet);
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const selRecs = () => active.filter((m) => sel.has(m.id));

  const overdue = active.filter(isMonOverdue).length;
  const mr = getLocalMonthRange();
  const dueMonth = active.filter((m) => m.status !== 'Completed' && m.monitoringDate && inRange(m.monitoringDate, mr)).length;
  const byLevel = (L: string): [number, number] => { const l = active.filter((m) => m.level === L); return [l.filter((m) => m.status === 'Completed').length, l.length]; };

  const changeStatus = (m: Monitoring, v: string) => {
    if (v === 'Overdue') return;
    if (v === 'Completed') {
      if (!m.monitoringDate) { showToast('error', 'Add a Monitoring Date before marking completed.'); return; }
      patch((s) => {
        s.monitoring = s.monitoring.map((x) => (x.id === m.id ? completeAndRollForwardMonitoringItem(x, s.monRollover) : x));
      });
    } else patch((s) => { s.monitoring = s.monitoring.map((x) => (x.id === m.id ? { ...x, status: v } : x)); });
  };
  const changeLevel = (m: Monitoring, v: MonitoringLevel) => patch((s) => {
    s.monitoring = s.monitoring.map((x) => (x.id === m.id ? { ...x, level: v, targetMonitoringDays: levelDays(v), annualOnsite: v === 'Level 1' ? x.annualOnsite : false, complianceCheck: v === 'Level 1' ? x.complianceCheck : false } : x));
  });
  const editField = (m: Monitoring, k: keyof Monitoring, v: unknown) => patch((s) => { s.monitoring = s.monitoring.map((x) => (x.id === m.id ? { ...x, [k]: v } : x)); });

  const doDelete = () => {
    const s = selRecs();
    if (!s.length) { showToast('warning', 'Select one or more funds to delete.'); return; }
    const ids = s.map((x) => x.id);
    setConfirm({
      title: 'Delete Fund' + (s.length > 1 ? 's' : ''), message: `Delete ${s.length} monitoring record${s.length > 1 ? 's' : ''}? You can restore with Undo (Ctrl+Z).`, confirmLabel: 'Delete',
      onConfirm: () => { patch((st) => { st.monitoring = st.monitoring.filter((x) => !ids.includes(x.id)); }); setSel(new Set()); setConfirm(null); showToast('success', `${s.length} fund${s.length > 1 ? 's' : ''} deleted.`); },
    });
  };
  const doArchive = () => {
    const s = selRecs();
    if (!s.length) { showToast('warning', 'Select funds to archive.'); return; }
    const ids = s.map((x) => x.id);
    setMon((list) => list.map((x) => (ids.includes(x.id) ? { ...x, archived: true } : x)));
    setSel(new Set());
    showToast('success', 'Archived selected funds.');
  };
  const addToBandwidth = () => {
    const s = selRecs();
    if (!s.length) { showToast('warning', 'Select monitoring records first.'); return; }
    let made = 0, blocked = 0;
    s.forEach((m) => {
      if (!m.monitoringDate) { blocked++; return; }
      const r = addTask({ title: 'Monitoring Call — ' + m.fund, description: `${m.fund} · ${m.level}`, analysts: [m.analyst || 'Unassigned'], label: 'Monitoring Calls', dueDate: m.monitoringDate, sourceModule: 'Monitoring Process', sourceId: m.id });
      if (r) made++;
    });
    if (blocked) showToast('error', `${blocked} record(s) had no Monitoring Date and were skipped.`);
    if (made) showToast('success', `${made} Monitoring Calls task${made > 1 ? 's' : ''} added.`);
  };

  const commitImport = (records: Monitoring[], diag: ImportDiag) => {
    if (records.length) patch((s) => { s.monitoring = [...s.monitoring, ...records]; });
    setImportDiag(diag);
    if (records.length) showToast('success', `${diag.imported} record${diag.imported > 1 ? 's' : ''} imported.`);
    else showToast('warning', 'No rows imported — see diagnostics.');
  };
  const onImportXlsx = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onerror = () => { showToast('error', 'Could not read the file.'); setImportDiag({ fileName: file.name, sheets: [], detected: 0, imported: 0, skipped: 0, warnings: [], errors: ['File read error.'] }); };
    reader.onload = (ev) => {
      try {
        const { records, diag } = readMonitoringWorkbook(ev.target!.result as ArrayBuffer, file.name);
        commitImport(records, diag);
      } catch (err) {
        setImportDiag({ fileName: file.name, sheets: [], detected: 0, imported: 0, skipped: 0, warnings: [], errors: ['Import failed: ' + (err instanceof Error ? err.message : String(err))], note: 'The file could not be parsed.' });
        showToast('error', 'Import failed — see diagnostics.');
      }
    };
    reader.readAsArrayBuffer(file);
  };
  const onImportCsv = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onerror = () => showToast('error', 'Could not read the file.');
    reader.onload = (ev) => {
      const diag: ImportDiag = { fileName: file.name, sheets: ['CSV'], detected: 0, imported: 0, skipped: 0, warnings: [], errors: [] };
      try {
        const { records, diag: d, headerFound } = parseMonitoringSheet(parseCsv(String(ev.target?.result || '')));
        diag.detected = d.detected; diag.imported = d.imported; diag.skipped = d.skipped; diag.warnings = d.warnings;
        if (!headerFound) diag.note = "No 'Fund' column found in the CSV header.";
        commitImport(records, diag);
      } catch (err) {
        diag.errors.push('Import failed: ' + (err instanceof Error ? err.message : String(err)));
        setImportDiag(diag); showToast('error', 'Import failed — see diagnostics.');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="module">
      <div className="module-head">
        <span className="module-title">Monitoring Process</span>
        <span className="module-meta">Rollover Date: {rolloverLabel(state.monRollover)}</span>
      </div>
      <div className="cards">
        <div className="card accent-gold"><div className="label">Total Active Funds</div><div className="value">{active.length}</div></div>
        <div className="card accent-red"><div className="label">Overdue Monitoring Dates</div><div className={'value' + (overdue ? ' red' : '')}>{overdue}</div></div>
        <div className="card accent-blue"><div className="label">Due This Month</div><div className="value">{dueMonth}</div></div>
        {LEVELS.map((L) => { const [c, tot] = byLevel(L); return (<div className="card" key={L}><div className="label">{L}</div><div className="value sm">{c} / {tot}</div></div>); })}
      </div>

      <div className="ribbon">
        <button className="btn gold" onClick={() => setEditRec({ level: 'Level 1', status: 'Not Started', analyst: 'Unassigned', annualOnsite: true, complianceCheck: true, targetMonitoringDays: 90 })}>New Fund</button>
        <button className="btn ghost" onClick={doDelete}>Delete</button>
        <button className="btn blue" onClick={doArchive}>Archive</button>
        <button className="btn" disabled={selRecs().length < 2} onClick={() => setBulk(true)}>Bulk Edit</button>
        <button className="btn" onClick={addToBandwidth}>Add to Analyst Bandwidth</button>
        <button className="btn gold" onClick={() => setRollover(true)}>Rollover</button>
        <div className="spacer"></div>
        <input className="inp-sm" style={{ width: '160px' }} placeholder="Search fund…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="inp-sm" value={fAnalyst} onChange={(e) => setFAnalyst(e.target.value)}><option>All</option>{APPROVED_ANALYSTS.map((a) => <option key={a}>{a}</option>)}</select>
        <select className="inp-sm" value={fLevel} onChange={(e) => setFLevel(e.target.value)}><option>All</option>{LEVELS.map((l) => <option key={l}>{l}</option>)}</select>
        <select className="inp-sm" value={fStatus} onChange={(e) => setFStatus(e.target.value)}><option>All</option><option>Not Started</option><option>In Progress</option><option>Completed</option><option>Overdue</option></select>
        <label className="save-view" title="Remember these filters on this device"><input type="checkbox" className="chk" checked={saveView} onChange={(e) => setSaveView(e.target.checked)} /> Save View</label>
      </div>

      <div className="tbl-wrap"><table>
        <thead><tr>
          <th style={{ width: '28px' }}><input type="checkbox" className="chk" title="Select all"
            ref={(el) => { if (el) { const all = rows.length > 0 && rows.every((r) => sel.has(r.id)); const some = rows.some((r) => sel.has(r.id)); el.checked = all; el.indeterminate = some && !all; } }}
            onChange={(e) => { const on = e.target.checked; setSel((prev) => { const n = new Set(prev); rows.forEach((r) => { if (on) n.add(r.id); else n.delete(r.id); }); return n; }); }} /></th>
          {COLS.map((c) => { const k = MON_KEY[c]; return <th key={c} className="srt" onClick={() => setSort((s) => nextSortDir(s, k))}>{c} <span className="car">{sortCaret(sort, k)}</span></th>; })}
        </tr></thead>
        <tbody>{rows.length ? rows.map((m) => { const st = monStatus(m); const ovr = st === 'Overdue'; const l1 = m.level === 'Level 1';
          return (<tr key={m.id} className={(sel.has(m.id) ? 'sel' : '') + (ovr ? ' mon-ovr' : '')}>
            <td><input type="checkbox" className="chk" checked={sel.has(m.id)} onChange={() => toggle(m.id)} /></td>
            <td style={{ cursor: 'pointer', fontWeight: 600 }} onClick={() => setEditRec(m)} className="clip" title={m.fund}>{m.fund}</td>
            <td><select className="inp-sm" value={m.analyst} onChange={(e) => editField(m, 'analyst', e.target.value)}>{APPROVED_ANALYSTS.map((a) => <option key={a}>{a}</option>)}</select></td>
            <td><select className="inp-sm" value={m.level} onChange={(e) => changeLevel(m, e.target.value as MonitoringLevel)}>{LEVELS.map((l) => <option key={l}>{l}</option>)}</select></td>
            <td className="nowrap"><DateCell value={m.mostRecent} onCommit={(v) => editField(m, 'mostRecent', v)} /></td>
            <td className="nowrap"><DateCell value={m.monitoringDate} onCommit={(v) => editField(m, 'monitoringDate', v)} /></td>
            <td><select className="inp-sm" value={st} onChange={(e) => changeStatus(m, e.target.value)}>
              {ovr && <option>Overdue</option>}<option>Not Started</option><option>In Progress</option><option>Completed</option></select></td>
            <td style={{ textAlign: 'center' }}><input type="checkbox" className="chk" disabled={!l1} style={{ opacity: l1 ? 1 : 0.35 }} checked={l1 && !!m.annualOnsite} onChange={(e) => editField(m, 'annualOnsite', e.target.checked)} /></td>
            <td style={{ textAlign: 'center' }}><input type="checkbox" className="chk" disabled={!l1} style={{ opacity: l1 ? 1 : 0.35 }} checked={l1 && !!m.complianceCheck} onChange={(e) => editField(m, 'complianceCheck', e.target.checked)} /></td>
          </tr>); }) : <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--muted)', padding: '20px' }}>No funds match the current filters.</td></tr>}
        </tbody></table></div>

      <div className="section-bar"><h3>Data</h3></div>
      <div className="ribbon">
        <label className="btn ghost" style={{ cursor: 'pointer' }}>Import XLSX<input type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={onImportXlsx} /></label>
        <label className="btn ghost" style={{ cursor: 'pointer' }}>Import CSV<input type="file" accept=".csv" style={{ display: 'none' }} onChange={onImportCsv} /></label>
        <button className="btn" onClick={() => exportMonitoringXlsx(active)}>Export XLSX</button>
        <button className="btn" onClick={() => exportMonitoring(active)}>Export CSV</button>
      </div>

      {editRec && <MonEditor rec={editRec} onSave={(r) => { patch((s) => { if (r.id && s.monitoring.some((x) => x.id === r.id)) s.monitoring = s.monitoring.map((x) => (x.id === r.id ? r : x)); else s.monitoring = [...s.monitoring, { ...r, id: uid('mon'), archived: false }]; }); setEditRec(null); showToast('success', 'Fund saved.'); }} onClose={() => setEditRec(null)} />}
      {confirm && <Confirm {...confirm} onCancel={() => setConfirm(null)} />}
      {bulk && <BulkEdit recs={selRecs()} onApply={(changes) => {
        const ids = selRecs().map((x) => x.id);
        patch((s) => {
          s.monitoring = s.monitoring.map((x) => {
            if (!ids.includes(x.id)) return x;
            const nx = { ...x };
            (Object.keys(changes) as (keyof BulkChanges)[]).forEach((k) => {
              const c = changes[k];
              if (c.on) {
                if (k === 'archived') nx.archived = true;
                else {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  (nx as any)[k] = c.val;
                  if (k === 'level') { nx.targetMonitoringDays = levelDays(c.val as string); if (c.val !== 'Level 1') { nx.annualOnsite = false; nx.complianceCheck = false; } }
                }
              }
            });
            if (nx.level !== 'Level 1') { nx.annualOnsite = false; nx.complianceCheck = false; }
            return nx;
          });
        });
        setBulk(false); setSel(new Set()); showToast('success', 'Bulk edit applied.');
      }} onClose={() => setBulk(false)} />}
      {rollover && <RolloverModal active={active} onClose={() => setRollover(false)}
        onRun={(iso, nonCompliant) => {
          if (nonCompliant) return;
          patch((s) => {
            s.monRollover = iso;
            const d = parseLocalDate(iso)!;
            const isJan1 = d.getMonth() === 0 && d.getDate() === 1;
            const months: Record<number, string[]> = { 3: ['Level 1'], 6: ['Level 1', 'Level 2'], 9: ['Level 1'], 0: ['Level 1', 'Level 2', 'Level 3'] };
            const applies = months[d.getMonth()] || ['Level 1'];
            s.monitoring = s.monitoring.map((m) => {
              if (m.archived || !applies.includes(m.level)) return m;
              const nm = { ...m };
              if (nm.status === 'Completed') nm.status = 'Not Started';
              if (isJan1 && m.level === 'Level 1') { nm.annualOnsite = false; nm.complianceCheck = false; }
              return nm;
            });
          });
          setRollover(false); showToast('success', 'Rollover applied. Header updated to ' + rolloverLabel(iso) + '.');
        }} />}
      {importDiag && <ImportDiagnostics diag={importDiag} onClose={() => setImportDiag(null)} />}
    </div>
  );
}

function MonEditor({ rec, onSave, onClose }: { rec: Partial<Monitoring>; onSave: (m: Monitoring) => void; onClose: () => void }) {
  const [m, setM] = useState<Partial<Monitoring>>({ ...rec });
  const f = (k: keyof Monitoring, v: unknown) => setM((p) => ({ ...p, [k]: v }));
  const l1 = m.level === 'Level 1';
  return (
    <Modal title={rec.id ? 'Edit Fund' : 'New Fund'} onClose={onClose}
      foot={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn gold" onClick={() => onSave(m as Monitoring)}>Save</button></>}>
      <div className="field"><label>Fund</label><input type="text" value={m.fund || ''} onChange={(e) => f('fund', e.target.value)} /></div>
      <div className="grid2">
        <div className="field"><label>Analyst</label><select value={m.analyst} onChange={(e) => f('analyst', e.target.value)}>{APPROVED_ANALYSTS.map((a) => <option key={a}>{a}</option>)}</select></div>
        <div className="field"><label>Monitoring Level</label><select value={m.level} onChange={(e) => { const v = e.target.value as MonitoringLevel; setM((p) => ({ ...p, level: v, targetMonitoringDays: levelDays(v), annualOnsite: v === 'Level 1' ? p.annualOnsite : false, complianceCheck: v === 'Level 1' ? p.complianceCheck : false })); }}>{LEVELS.map((l) => <option key={l}>{l}</option>)}</select></div>
      </div>
      <div className="grid2">
        <div className="field"><label>Most Recent Date</label><input type="date" value={toISO(m.mostRecent) || ''} onChange={(e) => f('mostRecent', e.target.value)} /></div>
        <div className="field"><label>Monitoring Date</label><input type="date" value={toISO(m.monitoringDate) || ''} onChange={(e) => f('monitoringDate', e.target.value)} /></div>
      </div>
      <div className="grid2">
        <div className="field"><label>Annual Onsite</label><label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 500, opacity: l1 ? 1 : 0.4 }}><input type="checkbox" className="chk" disabled={!l1} checked={l1 && !!m.annualOnsite} onChange={(e) => f('annualOnsite', e.target.checked)} /> {l1 ? 'Required (Level 1)' : 'N/A for this level'}</label></div>
        <div className="field"><label>Compliance Check</label><label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 500, opacity: l1 ? 1 : 0.4 }}><input type="checkbox" className="chk" disabled={!l1} checked={l1 && !!m.complianceCheck} onChange={(e) => f('complianceCheck', e.target.checked)} /> {l1 ? 'Required (Level 1)' : 'N/A for this level'}</label></div>
      </div>
      <div className="field"><label>Target Monitoring Days</label>
        <input type="number" min="0" value={m.targetMonitoringDays == null ? '' : m.targetMonitoringDays} onChange={(e) => f('targetMonitoringDays', e.target.value === '' ? '' : Number(e.target.value))} />
        <span style={{ fontSize: '12px', color: 'var(--muted)' }}>Defaults by level: L1 = 90, L2 = 180, L3 = 365.</span></div>
    </Modal>
  );
}

interface BulkChanges {
  analyst: { on: boolean; val: string };
  level: { on: boolean; val: string };
  status: { on: boolean; val: string };
  targetMonitoringDays: { on: boolean; val: number };
  annualOnsite: { on: boolean; val: boolean };
  complianceCheck: { on: boolean; val: boolean };
  archived: { on: boolean; val: boolean };
}
function BulkEdit({ recs, onApply, onClose }: { recs: Monitoring[]; onApply: (c: BulkChanges) => void; onClose: () => void }) {
  const [c, setC] = useState<BulkChanges>({
    analyst: { on: false, val: 'Unassigned' }, level: { on: false, val: 'Level 1' }, status: { on: false, val: 'Not Started' },
    targetMonitoringDays: { on: false, val: 90 }, annualOnsite: { on: false, val: true }, complianceCheck: { on: false, val: true }, archived: { on: false, val: true },
  });
  const set = (k: keyof BulkChanges, p: Partial<{ on: boolean; val: unknown }>) => setC((s) => ({ ...s, [k]: { ...s[k], ...p } }));
  const Field = ({ k, label, children }: { k: keyof BulkChanges; label: string; children: React.ReactNode }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 0' }}>
      <input type="checkbox" className="chk" checked={c[k].on} onChange={(e) => set(k, { on: e.target.checked })} />
      <span style={{ width: '150px', fontSize: '13.5px', fontWeight: 600 }}>{label}</span>{children}
    </div>
  );
  return (
    <Modal title={'Bulk Edit — ' + recs.length + ' funds'} onClose={onClose}
      foot={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn gold" onClick={() => onApply(c)}>Apply</button></>}>
      <p style={{ margin: 0, fontSize: '13px', color: 'var(--muted)' }}>Only checked fields are applied. Most Recent and Monitoring Date cannot be bulk edited.</p>
      <Field k="analyst" label="Analyst"><select disabled={!c.analyst.on} value={c.analyst.val} onChange={(e) => set('analyst', { val: e.target.value })}>{APPROVED_ANALYSTS.map((a) => <option key={a}>{a}</option>)}</select></Field>
      <Field k="level" label="Monitoring Level"><select disabled={!c.level.on} value={c.level.val} onChange={(e) => set('level', { val: e.target.value })}>{LEVELS.map((l) => <option key={l}>{l}</option>)}</select></Field>
      <Field k="status" label="Status"><select disabled={!c.status.on} value={c.status.val} onChange={(e) => set('status', { val: e.target.value })}><option>Not Started</option><option>In Progress</option><option>Completed</option></select></Field>
      <Field k="targetMonitoringDays" label="Target Monitoring Days"><input type="number" disabled={!c.targetMonitoringDays.on} value={c.targetMonitoringDays.val} onChange={(e) => set('targetMonitoringDays', { val: +e.target.value })} /></Field>
      <Field k="annualOnsite" label="Annual Onsite"><label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}><input type="checkbox" className="chk" disabled={!c.annualOnsite.on} checked={!!c.annualOnsite.val} onChange={(e) => set('annualOnsite', { val: e.target.checked })} /> Mark true (Level 1 only)</label></Field>
      <Field k="complianceCheck" label="Compliance Check"><label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}><input type="checkbox" className="chk" disabled={!c.complianceCheck.on} checked={!!c.complianceCheck.val} onChange={(e) => set('complianceCheck', { val: e.target.checked })} /> Mark true (Level 1 only)</label></Field>
      <Field k="archived" label="Archive selected funds"><span style={{ fontSize: '13px', color: 'var(--muted)' }}>moves to archive</span></Field>
    </Modal>
  );
}

function RolloverModal({ active, onClose, onRun }: { active: Monitoring[]; onClose: () => void; onRun: (iso: string, nonCompliant: boolean) => void }) {
  const yr = todayLocal().getFullYear();
  const opts: [string, string][] = [[`04/01/${yr}`, `${yr}-04-01`], [`07/01/${yr}`, `${yr}-07-01`], [`10/01/${yr}`, `${yr}-10-01`], [`01/01/${yr + 1}`, `${yr + 1}-01-01`]];
  const [pick, setPick] = useState(opts[0][1]);
  const result = useMemo(() => {
    const d = parseLocalDate(pick)!;
    const months: Record<number, string[]> = { 3: ['Level 1'], 6: ['Level 1', 'Level 2'], 9: ['Level 1'], 0: ['Level 1', 'Level 2', 'Level 3'] };
    const applies = months[d.getMonth()] || ['Level 1'];
    const recs = active.filter((m) => applies.includes(m.level));
    const bad = recs
      .filter((m) => { const expected = addDaysISO(pick, m.targetMonitoringDays); return m.monitoringDate && toISO(m.monitoringDate) !== expected; })
      .map((m) => ({ ...m, expected: addDaysISO(pick, m.targetMonitoringDays) }));
    return { bad };
  }, [pick, active]);
  const nonCompliant = result.bad.length > 0;
  return (
    <Modal title="Rollover Validation" wide onClose={onClose}
      foot={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn gold" disabled={nonCompliant} onClick={() => onRun(pick, nonCompliant)}>Run Rollover</button></>}>
      <div className="field"><label>Rollover Date</label>
        <select value={pick} onChange={(e) => setPick(e.target.value)}>{opts.map(([l, v]) => <option key={v} value={v}>{l}</option>)}</select></div>
      {nonCompliant ? (
        <>
          <p className="ovr" style={{ fontWeight: 600, margin: '4px 0' }}>Non-compliant records found. Cancel and correct these before rollover.</p>
          <div className="tbl-wrap" style={{ margin: 0 }}><table>
            <thead><tr><th>Fund</th><th>Analyst</th><th>Level</th><th>Actual Monitoring Date</th><th>Expected Monitoring Date</th><th>Target Days</th></tr></thead>
            <tbody>{result.bad.map((m) => <tr key={m.id}><td>{m.fund}</td><td>{m.analyst}</td><td>{m.level}</td><td>{formatDateMMDDYYYY(m.monitoringDate)}</td><td>{formatDateMMDDYYYY(m.expected)}</td><td className="num">{m.targetMonitoringDays}</td></tr>)}</tbody>
          </table></div>
        </>
      ) : <p style={{ color: 'var(--green-tx)', fontWeight: 600 }}>All applicable records comply. Run Rollover to update the rollover anchor and reset Completed statuses.</p>}
    </Modal>
  );
}

function ImportDiagnostics({ diag, onClose }: { diag: ImportDiag; onClose: () => void }) {
  return (
    <Modal title="Import Diagnostics" wide onClose={onClose} foot={<button className="btn gold" onClick={onClose}>Close</button>}>
      <table className="lvl-table"><tbody>
        <tr><th style={{ width: '190px' }}>File</th><td>{diag.fileName || '-'}</td></tr>
        <tr><th>Sheets processed</th><td>{diag.sheets && diag.sheets.length ? diag.sheets.join(', ') : '-'}</td></tr>
        <tr><th>Rows detected</th><td>{diag.detected}</td></tr>
        <tr><th>Rows imported</th><td style={{ fontWeight: 700, color: 'var(--green-tx)' }}>{diag.imported}</td></tr>
        <tr><th>Rows skipped</th><td>{diag.skipped}</td></tr>
      </tbody></table>
      {diag.imported === 0 && <p className="ovr" style={{ fontWeight: 600, marginTop: 10 }}>{diag.note || "No rows were imported. Check that the file has a 'Fund' column and at least one data row."}</p>}
      {diag.errors && diag.errors.length > 0 && <div style={{ marginTop: 10 }}><b style={{ color: 'var(--red)' }}>Errors</b><ul style={{ margin: '4px 0 0 18px', fontSize: '13px' }}>{diag.errors.map((e, i) => <li key={i}>{e}</li>)}</ul></div>}
      {diag.warnings && diag.warnings.length > 0 && <div style={{ marginTop: 10 }}><b style={{ color: 'var(--orange-tx)' }}>Warnings ({diag.warnings.length})</b><ul style={{ margin: '4px 0 0 18px', fontSize: '13px', maxHeight: '180px', overflow: 'auto' }}>{diag.warnings.slice(0, 40).map((w, i) => <li key={i}>{w}</li>)}{diag.warnings.length > 40 && <li>…and {diag.warnings.length - 40} more</li>}</ul></div>}
      {diag.imported > 0 && (!diag.warnings || !diag.warnings.length) && <p style={{ color: 'var(--green-tx)', fontWeight: 600, marginTop: 10 }}>Import completed cleanly.</p>}
    </Modal>
  );
}
