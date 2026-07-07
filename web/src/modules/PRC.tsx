import { useEffect, useRef, useState } from 'react';
import { useAim } from '../hooks/useAim';
import { toISO, todayLocal, parseLocalDate, addDaysISO, formatDateMMDDYYYY } from '../lib/dates';
import { applyColSort, nextSortDir, sortCaret, type SortState } from '../lib/sort';
import { applyAlias } from '../lib/roster';
import { uid } from '../lib/util';
import { showToast } from '../lib/toast';
import {
  splitEnts, joinEnts, normPres, computeMostRecent, sortByProjected, sortOptsByRecent, optLabel,
  flexPrivateFallback,
} from '../lib/prc';
import { DateCell } from '../components/DateCell';
import { Modal } from '../components/Modal';
import { Confirm } from '../components/Confirm';
import type { PrcSchedule, PrcArchive, EntityGlobal } from '../lib/domain';

type ConfirmState = { title: string; message: string; confirmLabel: string; onConfirm: () => void } | null;
type EntityCol = 'act40' | 'hedgeFund' | 'private';

/** Inline edit-in-place text cell — commits on blur/Enter, not per keystroke. */
function MacroCell({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [v, setV] = useState(value ?? '');
  useEffect(() => { setV(value ?? ''); }, [value]);
  return (
    <td onClick={(e) => e.stopPropagation()}>
      <input className="inp-sm" style={{ width: '100%', minWidth: '90px' }} value={v} placeholder="-"
        onChange={(e) => setV(e.target.value)}
        onBlur={() => { if (v !== (value ?? '')) onCommit(v); }}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
    </td>
  );
}

export function PRC() {
  const { state, patch } = useAim();
  const [sel, setSel] = useState<string | null>(null);
  const [selArch, setSelArch] = useState<string | null>(null);
  const [edit, setEdit] = useState<PrcSchedule | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [showMap, setShowMap] = useState(false);
  const [showFund, setShowFund] = useState(false);
  const [schSort, setSchSort] = useState<SortState>({ key: null, dir: null });
  const [arSort, setArSort] = useState<SortState>({ key: 'meetingDate', dir: 'desc' });
  const lastSnap = useRef<{ prcSchedule: PrcSchedule[]; prcArchive: PrcArchive[] } | null>(null);

  const archive = state.prcArchive;
  const schedBase = sortByProjected(state.prcSchedule).map((r) => ({ ...r, mostRecent: computeMostRecent(r.presentation, archive) || r.mostRecent }));
  const schedRows = applyColSort(schedBase, schSort, (r, k) => r[k as keyof PrcSchedule]);
  const top = schedBase[0];

  const snap = () => { lastSnap.current = { prcSchedule: structuredClone(state.prcSchedule), prcArchive: structuredClone(state.prcArchive) }; };
  const restore = () => { const s = lastSnap.current; if (!s) return; patch((st) => { st.prcSchedule = s.prcSchedule; st.prcArchive = s.prcArchive; }); lastSnap.current = null; };

  const editProjected = (id: string, iso: string) => patch((s) => { s.prcSchedule = s.prcSchedule.map((r) => (r.id === id ? { ...r, projectedNext: iso || null } : r)); });
  const editSchedMacro = (id: string, v: string) => patch((s) => { s.prcSchedule = s.prcSchedule.map((r) => (r.id === id ? { ...r, macro: v } : r)); });
  const editArchMacro = (id: string, v: string) => patch((s) => { s.prcArchive = s.prcArchive.map((r) => (r.id === id ? { ...r, macro: v } : r)); });

  const doArchive = () => {
    if (!sel) { showToast('error', 'Please select a meeting to archive'); return; }
    const row = schedRows.find((r) => r.id === sel)!;
    if (!row.projectedNext) { showToast('error', 'Enter a Projected Next date before archiving.'); return; }
    const dup = archive.some((a) => toISO(a.meetingDate) === toISO(row.projectedNext) && normPres(a.presentation) === normPres(row.presentation));
    if (dup) { showToast('error', 'An archive record already exists for this meeting date and presentation.'); return; }
    snap();
    const meetingDate = row.projectedNext;
    const newProjBase = state.prcSchedule.filter((r) => r.id !== row.id && r.projectedNext).map((r) => r.projectedNext!).sort((a, b) => parseLocalDate(b)!.getTime() - parseLocalDate(a)!.getTime())[0];
    const newProj = newProjBase ? addDaysISO(newProjBase, 14) : addDaysISO(meetingDate, 14);
    patch((s) => {
      s.prcArchive = [{ id: uid('ar'), meetingDate, macro: row.macro || '', presentation: row.presentation, act40: row.act40 || '', hedgeFund: row.hedgeFund || '', private: row.private || '', newFunds: row.newFunds || '', sharepointUrl: '' }, ...s.prcArchive];
      s.prcSchedule = s.prcSchedule.map((r) => (r.id === row.id ? { ...r, projectedNext: newProj, mostRecent: meetingDate, macro: '' } : r));
    });
    setSel(null);
    showToast('success', 'Archived selected meeting and moved it to the end of the schedule.', { undo: restore });
  };
  const doDeleteSched = () => {
    if (!sel) return;
    snap();
    setConfirm({ title: 'Delete Meeting Line', message: 'Delete this Meeting Schedule row?', confirmLabel: 'Delete', onConfirm: () => { patch((s) => { s.prcSchedule = s.prcSchedule.filter((r) => r.id !== sel); }); setSel(null); setConfirm(null); showToast('success', 'Deleted selected row.', { undo: restore }); } });
  };
  const doDeleteArch = () => {
    if (!selArch) return;
    snap();
    setConfirm({ title: 'Delete Archive Record', message: 'Delete this Meeting Archive row?', confirmLabel: 'Delete', onConfirm: () => { patch((s) => { s.prcArchive = s.prcArchive.filter((r) => r.id !== selArch); }); setSelArch(null); setConfirm(null); showToast('success', 'Deleted selected row.', { undo: restore }); } });
  };

  const archRows = applyColSort([...archive], arSort, (r, k) => r[k as keyof PrcArchive]);
  const SH = ({ k, children }: { k: string; children: React.ReactNode }) => (<th className="srt" onClick={() => setSchSort((s) => nextSortDir(s, k))}>{children} <span className="car">{sortCaret(schSort, k)}</span></th>);
  const AH = ({ k, children }: { k: string; children: React.ReactNode }) => (<th className="srt" onClick={() => setArSort((s) => nextSortDir(s, k))}>{children} <span className="car">{sortCaret(arSort, k)}</span></th>);
  const Cell = ({ v }: { v: string }) => (<td className="clip" title={v}>{v || '-'}</td>);

  return (
    <div className="module prc-module">
      <div className="module-head"><span className="module-title">Portfolio Research Committee</span></div>
      <div className="cards">
        <div className="card accent-gold"><div className="label">Next Projected Meeting</div><div className="value sm">{top && top.projectedNext ? formatDateMMDDYYYY(top.projectedNext) : '-'}</div></div>
        <div className="card accent-blue"><div className="label">Presentation</div><div className="value sm" style={{ fontSize: '15px' }}>{top ? top.presentation : '-'}</div></div>
        <div className="card"><div className="label">40-Act</div><div className="value sm" style={{ fontSize: '14px' }}>{top && top.act40 ? top.act40 : '-'}</div></div>
        <div className="card"><div className="label">Hedge Fund</div><div className="value sm" style={{ fontSize: '14px' }}>{top && top.hedgeFund ? top.hedgeFund : '-'}</div></div>
        <div className="card"><div className="label">Private</div><div className="value sm" style={{ fontSize: '14px' }}>{top && top.private ? top.private : '-'}</div></div>
      </div>

      <div className="section-bar"><h3>Meeting Schedule</h3></div>
      <div className="ribbon">
        <button className="btn gold" onClick={() => { snap(); patch((s) => { s.prcSchedule = [...s.prcSchedule, { id: uid('ms'), presentation: 'New Presentation', mostRecent: null, projectedNext: null, macro: '', act40: '', hedgeFund: '', private: '', newFunds: '' }]; }); showToast('success', 'New meeting line added.'); }}>New Meeting Line</button>
        <button className="btn blue" onClick={doArchive}>Archive</button>
        <button className={'btn ghost' + (!sel ? ' faded' : '')} onClick={() => { if (sel) doDeleteSched(); }}>Delete</button>
        <button className="btn" onClick={() => setShowMap(true)}>Mapping</button>
        <button className="btn" onClick={() => setShowFund(true)}>Fund List</button>
      </div>
      <div className="tbl-wrap"><table>
        <thead><tr><th></th><SH k="mostRecent">Most Recent</SH><SH k="projectedNext">Projected Next</SH><SH k="macro">Macro</SH><SH k="presentation">Presentation</SH><SH k="act40">40-Act</SH><SH k="hedgeFund">Hedge Fund</SH><SH k="private">Private</SH><SH k="newFunds">New Funds / Projects</SH></tr></thead>
        <tbody>{schedRows.map((r) => (
          <tr key={r.id} className={sel === r.id ? 'sel' : ''} onClick={() => setSel(r.id)}>
            <td><input type="radio" name="msrow" checked={sel === r.id} onChange={() => setSel(r.id)} /></td>
            <td className="nowrap">{formatDateMMDDYYYY(r.mostRecent)}</td>
            <td className="nowrap" onClick={(e) => e.stopPropagation()}><input type="date" className="inp-sm" value={toISO(r.projectedNext) || ''} onChange={(e) => editProjected(r.id, e.target.value)} /></td>
            <MacroCell value={r.macro} onCommit={(v) => editSchedMacro(r.id, v)} />
            <td style={{ fontWeight: 600, cursor: 'pointer' }} onClick={() => setEdit(r)} className="clip" title={r.presentation}>{r.presentation}</td>
            <Cell v={r.act40} /><Cell v={r.hedgeFund} /><Cell v={r.private} /><Cell v={r.newFunds} />
          </tr>))}</tbody>
      </table></div>

      <div className="section-bar"><h3>Meeting Archive</h3></div>
      <div className="ribbon">
        <button className="btn gold" onClick={() => { snap(); patch((s) => { s.prcArchive = [{ id: uid('ar'), meetingDate: toISO(todayLocal()), macro: '', presentation: '', act40: '', hedgeFund: '', private: '', newFunds: '', sharepointUrl: '' }, ...s.prcArchive]; }); showToast('success', 'New archive record added.'); }}>New Archive Record</button>
        <button className="btn ghost" onClick={() => setArSort({ key: 'meetingDate', dir: 'desc' })}>Sort Newest First</button>
        <button className="btn ghost" onClick={() => setArSort({ key: 'meetingDate', dir: 'asc' })}>Sort Oldest First</button>
        <button className={'btn ghost' + (!selArch ? ' faded' : '')} onClick={() => { if (selArch) doDeleteArch(); }}>Delete</button>
      </div>
      <div className="tbl-wrap"><table>
        <thead><tr><th></th><AH k="meetingDate">Meeting Date</AH><AH k="macro">Macro</AH><AH k="presentation">Presentation</AH><AH k="act40">40-Act</AH><AH k="hedgeFund">Hedge Fund</AH><AH k="private">Private</AH><AH k="newFunds">New Funds / Projects</AH><AH k="sharepointUrl">Sharepoint URL</AH></tr></thead>
        <tbody>{archRows.map((r) => { const url = r.sharepointUrl && /^https?:\/\//i.test(r.sharepointUrl) ? r.sharepointUrl : null;
          return (<tr key={r.id} className={selArch === r.id ? 'sel' : ''} onClick={() => setSelArch(r.id)}>
            <td><input type="radio" name="arrow" checked={selArch === r.id} onChange={() => setSelArch(r.id)} /></td>
            <td className="nowrap" onClick={(e) => e.stopPropagation()}><DateCell value={r.meetingDate} onCommit={(v) => patch((s) => { s.prcArchive = s.prcArchive.map((x) => (x.id === r.id ? { ...x, meetingDate: v } : x)); })} /></td>
            <MacroCell value={r.macro} onCommit={(v) => editArchMacro(r.id, v)} />
            <td className="clip" title={r.presentation} style={{ fontWeight: 600 }}>{r.presentation || '-'}</td>
            <Cell v={r.act40} /><Cell v={r.hedgeFund} /><Cell v={r.private} /><Cell v={r.newFunds} />
            <td onClick={(e) => e.stopPropagation()}>{url
              ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}><a href={url} target="_blank" rel="noopener">link</a>
                <button className="btn sm ghost" title="Delete link" style={{ padding: '1px 7px' }} onClick={() => patch((s) => { s.prcArchive = s.prcArchive.map((x) => (x.id === r.id ? { ...x, sharepointUrl: '' } : x)); })}>×</button></span>
              : <input type="url" className="inp-sm" style={{ width: '140px' }} placeholder="-" value={r.sharepointUrl || ''} onChange={(e) => patch((s) => { s.prcArchive = s.prcArchive.map((x) => (x.id === r.id ? { ...x, sharepointUrl: e.target.value } : x)); })} />}</td>
          </tr>); })}</tbody>
      </table></div>

      {edit && <PRCEdit row={edit} onClose={() => setEdit(null)} />}
      {confirm && <Confirm {...confirm} onCancel={() => setConfirm(null)} />}
      {showMap && <MappingPopup onClose={() => setShowMap(false)} />}
      {showFund && <FundListPopup onClose={() => setShowFund(false)} />}
    </div>
  );
}

function EntityField({ label, col, globalList, archive, selected, onChange, allowNew, onNew }: {
  label: string; col: EntityCol; globalList: EntityGlobal[]; archive: PrcArchive[]; selected: string[];
  onChange: (v: string[]) => void; allowNew?: boolean; onNew?: (n: string) => void;
}) {
  const [adding, setAdding] = useState('');
  const opts = sortOptsByRecent(globalList.map((e) => e.name), col, archive);
  const isFlex = (name: string) => globalList.find((e) => e.name === name && e.flex);
  const toggle = (n: string) => onChange(selected.includes(n) ? selected.filter((x) => x !== n) : [...selected, n]);
  return (
    <div className="field"><label>{label}</label>
      <div style={{ border: '1px solid #cbd4dd', borderRadius: '7px', maxHeight: '130px', overflow: 'auto', padding: '5px' }}>
        {opts.map((o) => (<label key={o.n} style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '3px 4px', fontSize: '13px' }}>
          <input type="checkbox" className="chk" checked={selected.includes(o.n)} onChange={() => toggle(o.n)} />
          <span>{optLabel(o)}{isFlex(o.n) ? <span className="pill gray" style={{ marginLeft: 6, fontSize: 11 }}>Flex</span> : null}</span></label>))}
        {!opts.length && <div className="mini" style={{ padding: '4px' }}>No entities available.</div>}
      </div>
      {allowNew && <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
        <input type="text" className="inp-sm" placeholder={'New ' + label + '…'} value={adding} onChange={(e) => setAdding(e.target.value)} />
        <button className="btn sm ghost" onClick={() => { const v = applyAlias(adding.trim()); if (!v) return; onNew?.(v); onChange([...selected, v]); setAdding(''); }}>Add</button>
      </div>}
    </div>
  );
}

function PRCEdit({ row, onClose }: { row: PrcSchedule; onClose: () => void }) {
  const { state, patch } = useAim();
  const archive = state.prcArchive;
  const mapping = state.prcMapping;
  const [pres, setPres] = useState(row.presentation);
  const [newPres, setNewPres] = useState('');
  const [macro, setMacro] = useState(row.macro || '');
  const [a40, setA40] = useState(splitEnts(row.act40));
  const [hf, setHF] = useState(splitEnts(row.hedgeFund));
  const [pv, setPv] = useState(splitEnts(row.private));
  const [nf, setNf] = useState(row.newFunds || '');

  const presOpts = sortOptsByRecent(mapping.presentations.filter((p) => p !== 'Flex'), 'presentation', archive);
  const applyPresentation = (p: string) => {
    setPres(p);
    const m40 = mapping.map40[p] || []; const mhf = mapping.mapHF[p] || []; let mpv = mapping.mapPriv[p] || [];
    if (!mpv.length) { const fb = flexPrivateFallback(mapping, archive); if (fb) mpv = [fb]; }
    setA40(m40); setHF(mhf); setPv(mpv);
  };
  const addGlobal = (key: 'act40Global' | 'hedgeFundGlobal' | 'privateGlobal', name: string) => patch((s) => { const arr = s.prcMapping[key]; if (!arr.find((e) => e.name === name)) s.prcMapping[key] = [...arr, { name, flex: false }]; });

  const save = () => {
    let finalPres = pres;
    patch((s) => {
      if (newPres.trim()) { finalPres = applyAlias(newPres.trim())!; if (!s.prcMapping.presentations.includes(finalPres)) s.prcMapping.presentations = [...s.prcMapping.presentations, finalPres]; }
      s.prcSchedule = s.prcSchedule.map((r) => (r.id === row.id ? { ...r, presentation: finalPres, macro, act40: joinEnts(a40), hedgeFund: joinEnts(hf), private: joinEnts(pv), newFunds: nf } : r));
    });
    onClose(); showToast('success', 'Meeting line updated.');
  };
  return (
    <Modal title="Edit Meeting Line" wide onClose={onClose}
      foot={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn gold" onClick={save}>Save</button></>}>
      <div className="field"><label>Presentation</label>
        <select value={pres} onChange={(e) => applyPresentation(e.target.value)}>
          {!presOpts.find((o) => o.n === pres) && <option value={pres}>{pres}</option>}
          {presOpts.map((o) => <option key={o.n} value={o.n}>{optLabel(o)}</option>)}
        </select>
        <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
          <input type="text" className="inp-sm" placeholder="Or type a new Presentation…" value={newPres} onChange={(e) => setNewPres(e.target.value)} />
        </div>
      </div>
      <div className="field"><label>Macro</label><textarea value={macro} onChange={(e) => setMacro(e.target.value)} /></div>
      <EntityField label="40-Act" col="act40" globalList={mapping.act40Global} archive={archive} selected={a40} onChange={setA40} allowNew onNew={(n) => addGlobal('act40Global', n)} />
      <EntityField label="Hedge Fund" col="hedgeFund" globalList={mapping.hedgeFundGlobal} archive={archive} selected={hf} onChange={setHF} allowNew onNew={(n) => addGlobal('hedgeFundGlobal', n)} />
      <EntityField label="Private" col="private" globalList={mapping.privateGlobal} archive={archive} selected={pv} onChange={setPv} allowNew onNew={(n) => addGlobal('privateGlobal', n)} />
      <div className="field"><label>New Funds / Projects</label><textarea value={nf} onChange={(e) => setNf(e.target.value)} /></div>
    </Modal>
  );
}

const MAP_CFG: Record<string, { key: 'map40' | 'mapHF' | 'mapPriv'; glob: 'act40Global' | 'hedgeFundGlobal' | 'privateGlobal'; col: EntityCol }> = {
  '40-Act': { key: 'map40', glob: 'act40Global', col: 'act40' },
  'Hedge Fund': { key: 'mapHF', glob: 'hedgeFundGlobal', col: 'hedgeFund' },
  Private: { key: 'mapPriv', glob: 'privateGlobal', col: 'private' },
};

function MappingPopup({ onClose }: { onClose: () => void }) {
  const { state, patch } = useAim();
  const mapping = state.prcMapping;
  const [tab, setTab] = useState<'40-Act' | 'Hedge Fund' | 'Private'>('40-Act');
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const cfg = MAP_CFG[tab];
  const presentations = mapping.presentations.filter((p) => p !== 'Flex');
  const globalNames = mapping[cfg.glob];
  const addEntityOpts = () => {
    const flex = globalNames.filter((e) => e.flex).map((e) => e.name).sort((a, b) => a.localeCompare(b));
    const rest = globalNames.filter((e) => !e.flex).map((e) => e.name).sort((a, b) => a.localeCompare(b));
    return [...flex, ...rest];
  };
  const isFlex = (n: string) => globalNames.find((e) => e.name === n && e.flex);
  const updateSchedFor = (pres: string) => patch((s) => { const m = s.prcMapping[cfg.key][pres] || []; s.prcSchedule = s.prcSchedule.map((r) => (r.presentation === pres ? { ...r, [cfg.col]: joinEnts(m) } : r)); });
  const addMap = (pres: string, ent: string) => { patch((s) => { const cur = s.prcMapping[cfg.key][pres] || []; if (!cur.includes(ent)) s.prcMapping[cfg.key] = { ...s.prcMapping[cfg.key], [pres]: [...cur, ent] }; }); setTimeout(() => updateSchedFor(pres), 0); };
  const removeMap = (pres: string, ent: string) => { patch((s) => { const cur = s.prcMapping[cfg.key][pres] || []; s.prcMapping[cfg.key] = { ...s.prcMapping[cfg.key], [pres]: cur.filter((x) => x !== ent) }; }); setTimeout(() => updateSchedFor(pres), 0); };
  const renamePres = (oldN: string, newN: string) => {
    if (!newN.trim() || newN === oldN) return;
    const nn = applyAlias(newN.trim())!;
    patch((s) => {
      s.prcMapping.presentations = s.prcMapping.presentations.map((p) => (p === oldN ? nn : p));
      (['map40', 'mapHF', 'mapPriv'] as const).forEach((k) => { if (s.prcMapping[k][oldN]) { s.prcMapping[k][nn] = s.prcMapping[k][oldN]; delete s.prcMapping[k][oldN]; } });
      s.prcSchedule = s.prcSchedule.map((r) => (r.presentation === oldN ? { ...r, presentation: nn } : r));
    });
  };
  const deletePres = (p: string) => setConfirm({
    title: 'Delete Presentation Mapping', message: `Delete the mapping for "${p}"? Meeting Archive records and global entities are not affected.`, confirmLabel: 'Delete',
    onConfirm: () => { patch((s) => { s.prcMapping.presentations = s.prcMapping.presentations.filter((x) => x !== p); (['map40', 'mapHF', 'mapPriv'] as const).forEach((k) => { delete s.prcMapping[k][p]; }); }); setConfirm(null); showToast('success', 'Presentation mapping deleted.'); },
  });

  return (
    <Modal title="Mapping — Assign Entities to Presentations" wide onClose={onClose}
      foot={<button className="btn gold" onClick={() => { onClose(); showToast('success', 'Mapping saved.'); }}>Done</button>}>
      <div className="tabs">{(['40-Act', 'Hedge Fund', 'Private'] as const).map((tt) => <button key={tt} className={tab === tt ? 'on' : ''} onClick={() => setTab(tt)}>{tt}</button>)}</div>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
        <input type="text" className="inp-sm" id="newpresmap" placeholder="New Presentation name…" />
        <button className="btn sm ghost" onClick={() => { const el = document.getElementById('newpresmap') as HTMLInputElement; const v = applyAlias((el.value || '').trim()); if (!v) return; patch((s) => { if (!s.prcMapping.presentations.includes(v)) s.prcMapping.presentations = [...s.prcMapping.presentations, v]; }); el.value = ''; showToast('success', 'Presentation created.'); }}>Add Presentation</button>
      </div>
      {presentations.map((p) => (
        <MapRow key={p} pres={p} ents={mapping[cfg.key][p] || []} addOpts={addEntityOpts()} isFlex={(n) => !!isFlex(n)}
          onAdd={(ent) => addMap(p, ent)} onRemove={(ent) => removeMap(p, ent)} onRename={(nn) => renamePres(p, nn)} onDelete={() => deletePres(p)} />
      ))}
      {confirm && <Confirm {...confirm} onCancel={() => setConfirm(null)} />}
    </Modal>
  );
}

function MapRow({ pres, ents, addOpts, isFlex, onAdd, onRemove, onRename, onDelete }: {
  pres: string; ents: string[]; addOpts: string[]; isFlex: (n: string) => boolean;
  onAdd: (e: string) => void; onRemove: (e: string) => void; onRename: (n: string) => void; onDelete: () => void;
}) {
  const [adding, setAdding] = useState('');
  return (
    <div className="map-row">
      <div className="pname"><input type="text" className="inp-sm" defaultValue={pres} onBlur={(e) => onRename(e.target.value)} /></div>
      <div className="map-ents">
        {ents.map((e) => <span key={e} className={'ent-chip' + (isFlex(e) ? ' flex' : '')}>{e}<button onClick={() => onRemove(e)}>×</button></span>)}
        <select className="inp-sm" style={{ width: '160px' }} value={adding} onChange={(e) => { if (e.target.value) { onAdd(e.target.value); setAdding(''); } }}>
          <option value="">+ Add entity…</option>
          {addOpts.filter((o) => !ents.includes(o)).map((o) => <option key={o} value={o}>{isFlex(o) ? '★ ' : ''}{o}</option>)}
        </select>
        <button className="btn sm ghost" onClick={onDelete}>Delete</button>
      </div>
    </div>
  );
}

const FUND_CFG: Record<string, { glob: 'act40Global' | 'hedgeFundGlobal' | 'privateGlobal'; flexAllowed: boolean; mapKey: 'map40' | 'mapHF' | 'mapPriv'; col: EntityCol }> = {
  '40-Act': { glob: 'act40Global', flexAllowed: false, mapKey: 'map40', col: 'act40' },
  'Hedge Fund': { glob: 'hedgeFundGlobal', flexAllowed: true, mapKey: 'mapHF', col: 'hedgeFund' },
  Private: { glob: 'privateGlobal', flexAllowed: true, mapKey: 'mapPriv', col: 'private' },
};

function FundListPopup({ onClose }: { onClose: () => void }) {
  const { state, patch } = useAim();
  const mapping = state.prcMapping;
  const [tab, setTab] = useState<'40-Act' | 'Hedge Fund' | 'Private'>('40-Act');
  const cfg = FUND_CFG[tab];
  const list = mapping[cfg.glob];
  const [selSet, setSelSet] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState('');
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const toggle = (n: string) => setSelSet((s) => { const x = new Set(s); if (x.has(n)) x.delete(n); else x.add(n); return x; });
  const add = () => { const v = applyAlias(adding.trim()); if (!v) return; patch((s) => { if (!s.prcMapping[cfg.glob].find((e) => e.name === v)) s.prcMapping[cfg.glob] = [...s.prcMapping[cfg.glob], { name: v, flex: false }]; }); setAdding(''); showToast('success', 'Fund List updated.'); };
  const removeSel = () => {
    const names = [...selSet];
    if (!names.length) return;
    setConfirm({
      title: 'Remove Entities', message: names.length > 1 ? 'Remove selected entities from the global Fund List?' : 'Remove this entity from the global Fund List?', confirmLabel: 'Remove',
      onConfirm: () => {
        patch((s) => {
          s.prcMapping[cfg.glob] = s.prcMapping[cfg.glob].filter((e) => !names.includes(e.name));
          const mk = s.prcMapping[cfg.mapKey];
          Object.keys(mk).forEach((p) => { mk[p] = mk[p].filter((x) => !names.includes(x)); });
          s.prcSchedule = s.prcSchedule.map((r) => { const cur = splitEnts(r[cfg.col]).filter((x) => !names.includes(x)); return { ...r, [cfg.col]: joinEnts(cur) }; });
        });
        setSelSet(new Set()); setConfirm(null); showToast('success', 'Fund List updated.');
      },
    });
  };
  const toggleFlex = (n: string) => patch((s) => { s.prcMapping[cfg.glob] = s.prcMapping[cfg.glob].map((e) => (e.name === n ? { ...e, flex: !e.flex } : e)); });

  return (
    <Modal title="Global Entity Window — Fund List" wide onClose={onClose}
      foot={<><button className="btn ghost" onClick={onClose}>Close</button><button className="btn gold" onClick={() => { onClose(); showToast('success', 'Fund List updated.'); }}>Save</button></>}>
      <div className="tabs">{(['40-Act', 'Hedge Fund', 'Private'] as const).map((tt) => <button key={tt} className={tab === tt ? 'on' : ''} onClick={() => { setTab(tt); setSelSet(new Set()); }}>{tt}</button>)}</div>
      <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
        <input type="text" className="inp-sm" placeholder={'New ' + tab + ' entity…'} value={adding} onChange={(e) => setAdding(e.target.value)} />
        <button className="btn sm gold" onClick={add}>Add</button>
        <div className="spacer"></div>
        <button className="btn sm ghost" disabled={!selSet.size} onClick={removeSel}>Remove Selected</button>
      </div>
      <div style={{ border: '1px solid var(--line)', borderRadius: '8px', maxHeight: '320px', overflow: 'auto' }}>
        {list.map((e) => (<div key={e.name} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 10px', borderBottom: '1px solid var(--line-2)' }}>
          <input type="checkbox" className="chk" checked={selSet.has(e.name)} onChange={() => toggle(e.name)} />
          <span style={{ flex: 1, fontSize: '13.5px', fontWeight: 500 }}>{e.name}{e.flex ? <span className="pill gray" style={{ marginLeft: 6, fontSize: 11 }}>Flex</span> : null}</span>
          {cfg.flexAllowed && <label className="mini" style={{ cursor: 'pointer' }}><input type="checkbox" className="chk" checked={!!e.flex} onChange={() => toggleFlex(e.name)} /> Flex</label>}
        </div>))}
        {!list.length && <div className="mini" style={{ padding: '12px' }}>No entities.</div>}
      </div>
      {confirm && <Confirm {...confirm} onCancel={() => setConfirm(null)} />}
    </Modal>
  );
}
