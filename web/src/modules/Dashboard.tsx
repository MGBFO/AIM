import { useState } from 'react';
import { useAim } from '../hooks/useAim';
import { formatDateMMDDYYYY, parseLocalDate, todayLocal, getLocalQuarterRange, inRange } from '../lib/dates';
import { isValidUrl, normUrl } from '../lib/format';
import { isMonOverdue } from '../lib/monitoring';
import { isTaskOverdue } from '../lib/tasks';
import { uid } from '../lib/util';
import { showToast } from '../lib/toast';
import { Modal } from '../components/Modal';
import { Confirm } from '../components/Confirm';
import type { AimState, Trip, UsefulLink } from '../lib/domain';

const t = (d: string | null) => parseLocalDate(d)?.getTime() ?? 0;

export function Dashboard() {
  const { state, patch } = useAim();
  const today = todayLocal();
  const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  const trips = state.trips || [];
  const recentTrips = trips
    .filter((tr) => (tr.section === 'archived' || tr.section === 'upcoming') && tr.date && parseLocalDate(tr.date) && parseLocalDate(tr.date)! < todayMid)
    .sort((a, b) => t(b.date) - t(a.date))
    .slice(0, 5);
  const nextTrips = trips
    .filter((tr) => tr.section === 'upcoming' && tr.date && parseLocalDate(tr.date) && parseLocalDate(tr.date)! >= todayMid)
    .sort((a, b) => t(a.date) - t(b.date))
    .slice(0, 5);

  const active = (state.monitoring || []).filter((m) => !m.archived);
  const qr = getLocalQuarterRange();
  const lvlRows = ['Level 1', 'Level 2', 'Level 3'].map((L) => {
    const inL = active.filter((m) => m.level === L);
    // Completed this quarter: the cycle's date (Most Recent, stamped on
    // completion) falls in the quarter. Due: not yet completed and its
    // Monitoring Date falls in the quarter. Total = both = cycles this quarter.
    const completed = inL.filter((m) => m.status === 'Completed' && m.mostRecent && inRange(m.mostRecent, qr)).length;
    const due = inL.filter((m) => m.status !== 'Completed' && m.monitoringDate && inRange(m.monitoringDate, qr)).length;
    return { L, completed, due, total: completed + due };
  });
  const qTotals = lvlRows.reduce((a, r) => ({ completed: a.completed + r.completed, total: a.total + r.total }), { completed: 0, total: 0 });
  const maxTotal = Math.max(1, ...lvlRows.map((r) => r.total));

  // Annual Onsite / Compliance Check: checked boxes over the total number of
  // Level 1 managers (both share the same denominator).
  const level1 = active.filter((m) => m.level === 'Level 1');
  const l1Total = level1.length;
  const onsiteChecked = level1.filter((m) => m.annualOnsite).length;
  const compChecked = level1.filter((m) => m.complianceCheck).length;
  const ratio = (n: number, d: number) => (d === 0 ? `${n} / ${d}` : `${n} / ${d} (${Math.round((n / d) * 100)}%)`);
  const l1Overdue = level1.filter(isMonOverdue).length;
  const l1OverduePct = l1Total ? Math.round((l1Overdue / l1Total) * 100) : 0;

  const overdueTasks = (state.tasks || []).filter(isTaskOverdue).sort((a, b) => t(a.dueDate) - t(b.dueDate));

  const top = [...(state.prcSchedule || [])].filter((r) => r.projectedNext).sort((a, b) => t(a.projectedNext) - t(b.projectedNext))[0];
  const prcVal = (v: string) => (v && String(v).trim() && v !== '-' ? v : '-');
  const quarterLabel = `Q${Math.floor(today.getMonth() / 3) + 1} ${today.getFullYear()}`;

  const travelTable = (rows: Trip[], empty: string) => (
    <table className="mini-tbl">
      <thead><tr><th>Date</th><th>City</th><th>Analyst</th><th>Event/Conference</th><th>Days</th></tr></thead>
      <tbody>
        {rows.length ? rows.map((tr) => (
          <tr key={tr.id}>
            <td className="nowrap">{formatDateMMDDYYYY(tr.date)}</td>
            <td className="clip" title={tr.city}>{tr.city || '-'}</td>
            <td className="clip" title={tr.analyst}>{tr.analyst || '-'}</td>
            <td className="clip" title={tr.event}>{tr.event || '-'}</td>
            <td className="num">{tr.days == null ? '-' : tr.days}</td>
          </tr>
        )) : <tr><td colSpan={5} style={{ color: 'var(--muted)', textAlign: 'center', padding: '12px' }}>{empty}</td></tr>}
      </tbody>
    </table>
  );

  return (
    <div className="module">
      <div className="module-head">
        <span className="module-title">Dashboard</span>
        <span className="module-meta">Live overview · {formatDateMMDDYYYY(todayLocal())}</span>
      </div>
      <div className="dash-grid">
        <div className="panel dash-tall">
          <h4>Monitoring Process — {quarterLabel}</h4>
          <div className="panel-sub">Completed vs due this quarter</div>
          <table className="lvl-table">
            <thead><tr><th>Monitoring Level</th><th className="num">Completed</th><th className="num">Due</th><th className="num">Total</th></tr></thead>
            <tbody>{lvlRows.map((r) => (<tr key={r.L}><td>{r.L}</td><td className="num">{r.completed}</td><td className="num">{r.due}</td><td className="num">{r.total}</td></tr>))}</tbody>
          </table>
          <div className="mon-bars">
            <div className="panel-sub" style={{ marginTop: 10 }}>Monitoring tasks this quarter — completed in green</div>
            {lvlRows.map((r) => (
              <div className="mon-bar-row" key={r.L}>
                <span className="mon-bar-lbl">{r.L}</span>
                <div className="mon-bar-wrap"><div className="mon-bar-track" style={{ width: `${(r.total / maxTotal) * 100}%` }}><div className="mon-bar-fill" style={{ width: `${r.total ? (r.completed / r.total) * 100 : 0}%` }} /></div></div>
                <span className="mon-bar-val">{r.completed}/{r.total}</span>
              </div>
            ))}
            <div className="mon-bar-row total">
              <span className="mon-bar-lbl">Total</span>
              <div className="mon-bar-wrap"><div className="mon-bar-track" style={{ width: '100%' }}><div className="mon-bar-fill" style={{ width: `${qTotals.total ? (qTotals.completed / qTotals.total) * 100 : 0}%` }} /></div></div>
              <span className="mon-bar-val">{qTotals.completed}/{qTotals.total}</span>
            </div>
          </div>
          <div className="ratio-row">
            <div className="ratio">Annual Onsite<br /><b>{ratio(onsiteChecked, l1Total)}</b> <span className={'ovr-pct' + (l1OverduePct === 0 ? ' ok' : '')}>{l1OverduePct}% overdue</span></div>
            <div className="ratio">Compliance Check<br /><b>{ratio(compChecked, l1Total)}</b> <span className={'ovr-pct' + (l1OverduePct === 0 ? ' ok' : '')}>{l1OverduePct}% overdue</span></div>
          </div>
        </div>

        <div className="panel">
          <h4>Overdue Tasks</h4>
          {overdueTasks.length ? (
            <>
              <div className="panel-sub" style={{ color: 'var(--red)' }}>{overdueTasks.length} task{overdueTasks.length > 1 ? 's' : ''} overdue</div>
              <table className="mini-tbl overdue-tbl">
                <thead><tr><th>Task</th><th>Analyst</th><th>Due</th></tr></thead>
                <tbody>{overdueTasks.map((tk) => (
                  <tr key={tk.id}>
                    <td className="clip" title={tk.title}>{tk.title}</td>
                    <td className="clip" title={tk.analysts.join(' / ')}>{tk.analysts.join(' / ')}</td>
                    <td className="nowrap">{formatDateMMDDYYYY(tk.dueDate)}</td>
                  </tr>))}</tbody>
              </table>
            </>
          ) : <div className="all-clear">All tasks are up to date</div>}
        </div>

        <div className="panel">
          <h4>Portfolio Research Committee</h4>
          <div className="panel-sub">Next meeting on schedule</div>
          <div className="prc-box">
            <div className="b"><div className="l">Next Projected Meeting</div><div className="v">{top && top.projectedNext ? formatDateMMDDYYYY(top.projectedNext) : '-'}</div></div>
            <div className="b"><div className="l">Presentation</div><div className="v">{top ? prcVal(top.presentation) : '-'}</div></div>
            <div className="b"><div className="l">40-Act</div><div className="v">{top ? prcVal(top.act40) : '-'}</div></div>
            <div className="b"><div className="l">Hedge Fund</div><div className="v">{top ? prcVal(top.hedgeFund) : '-'}</div></div>
            <div className="b"><div className="l">Private</div><div className="v">{top ? prcVal(top.private) : '-'}</div></div>
          </div>
        </div>

        <div className="panel"><h4>Most Recent 5 Trips</h4>{travelTable(recentTrips, 'No past trips on record.')}</div>
        <div className="panel"><h4>Next Upcoming 5 Trips</h4>{travelTable(nextTrips, 'No upcoming trips scheduled.')}</div>

        <div className="panel full"><UsefulLinks state={state} patch={patch} /></div>
      </div>
    </div>
  );
}

function UsefulLinks({ state, patch }: { state: AimState; patch: (m: (s: AimState) => void) => void }) {
  const links = state.usefulLinks || [];
  const [edit, setEdit] = useState<Partial<UsefulLink> | null>(null);
  const [confirm, setConfirm] = useState<{ title: string; message: string; confirmLabel: string; onConfirm: () => void } | null>(null);
  const [shown, setShown] = useState<Record<string, boolean>>({});

  const save = (l: Partial<UsefulLink>) => {
    patch((s) => {
      const ex = (s.usefulLinks || []).some((x) => x.id === l.id);
      if (ex) s.usefulLinks = s.usefulLinks.map((x) => (x.id === l.id ? { ...(l as UsefulLink) } : x));
      else s.usefulLinks = [...(s.usefulLinks || []), { name: '', login: '', password: '', url: '', notes: '', ...l, id: uid('lnk') } as UsefulLink];
    });
    setEdit(null);
    showToast('success', 'Link saved.');
  };
  const del = (l: UsefulLink) => setConfirm({
    title: 'Delete Link', message: `Delete "${l.name || 'this link'}"?`, confirmLabel: 'Delete',
    onConfirm: () => { patch((s) => { s.usefulLinks = (s.usefulLinks || []).filter((x) => x.id !== l.id); }); setConfirm(null); showToast('success', 'Link deleted.'); },
  });
  const open = (l: UsefulLink) => {
    if (!isValidUrl(l.url)) { showToast('warning', 'This link has an invalid URL and cannot be opened.'); return; }
    window.open(normUrl(l.url), '_blank', 'noopener');
  };

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <h4 style={{ margin: 0, flex: 1 }}>Useful Links</h4>
        <button className="btn gold" onClick={() => setEdit({ name: '', login: '', password: '', url: '', notes: '' })}>Add Link</button>
      </div>
      <div className="panel-sub" style={{ marginTop: 6 }}>Shared with the team. Passwords are masked by default.</div>
      <div className="tbl-wrap" style={{ margin: '4px 0 0' }}>
        <table className="links-tbl">
          <thead><tr><th>Name</th><th>Login</th><th>Password</th><th>Link</th><th>Notes</th><th style={{ width: '150px' }}>Actions</th></tr></thead>
          <tbody>
            {links.length ? links.map((l) => (
              <tr key={l.id}>
                <td style={{ fontWeight: 600 }}>{l.name || '-'}</td>
                <td>{l.login || '-'}</td>
                <td>{l.password ? (
                  <span><span className="link-pass">{shown[l.id] ? l.password : '••••••••'}</span>
                    <button className="icon-btn" onClick={() => setShown((s) => ({ ...s, [l.id]: !s[l.id] }))}>{shown[l.id] ? 'Hide' : 'Show'}</button></span>
                ) : '-'}</td>
                <td>{l.url ? <a href="#" onClick={(e) => { e.preventDefault(); open(l); }} style={{ color: 'var(--blue)', fontWeight: 600 }}>Open ↗</a> : '-'}</td>
                <td className="clip" title={l.notes} style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.notes || '-'}</td>
                <td><button className="icon-btn" onClick={() => setEdit(l)}>Edit</button><button className="icon-btn" onClick={() => del(l)}>Delete</button></td>
              </tr>
            )) : <tr><td colSpan={6} style={{ color: 'var(--muted)', textAlign: 'center', padding: '14px' }}>No links yet. Add one to get started.</td></tr>}
          </tbody>
        </table>
      </div>
      {edit && <LinkEditor link={edit} onClose={() => setEdit(null)} onSave={save} />}
      {confirm && <Confirm {...confirm} onCancel={() => setConfirm(null)} />}
    </>
  );
}

function LinkEditor({ link, onClose, onSave }: { link: Partial<UsefulLink>; onClose: () => void; onSave: (l: Partial<UsefulLink>) => void }) {
  const [l, setL] = useState<Partial<UsefulLink>>({ ...link });
  const [showPw, setShowPw] = useState(false);
  const f = (k: keyof UsefulLink, v: string) => setL((p) => ({ ...p, [k]: v }));
  const submit = () => {
    if (!l.name || !l.name.trim()) { showToast('warning', 'Name is required.'); return; }
    if (!l.url || !l.url.trim()) { showToast('warning', 'Link is required.'); return; }
    if (!isValidUrl(l.url)) { showToast('warning', 'Enter a valid URL (e.g. https://example.com).'); return; }
    onSave({ ...l, name: l.name.trim(), url: l.url.trim() });
  };
  return (
    <Modal title={link.id ? 'Edit Link' : 'Add Link'} onClose={onClose}
      foot={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn gold" onClick={submit}>Save</button></>}>
      <div className="field"><label>Name *</label><input type="text" value={l.name || ''} onChange={(e) => f('name', e.target.value)} /></div>
      <div className="field"><label>Link *</label><input type="text" placeholder="https://…" value={l.url || ''} onChange={(e) => f('url', e.target.value)} /></div>
      <div className="grid2">
        <div className="field"><label>Login</label><input type="text" value={l.login || ''} onChange={(e) => f('login', e.target.value)} /></div>
        <div className="field"><label>Password</label>
          <div style={{ display: 'flex', gap: '6px' }}>
            <input type={showPw ? 'text' : 'password'} style={{ flex: 1 }} value={l.password || ''} onChange={(e) => f('password', e.target.value)} />
            <button type="button" className="btn ghost" onClick={() => setShowPw((s) => !s)}>{showPw ? 'Hide' : 'Show'}</button>
          </div>
        </div>
      </div>
      <div className="field"><label>Notes</label><textarea rows={3} value={l.notes || ''} onChange={(e) => f('notes', e.target.value)} /></div>
    </Modal>
  );
}
