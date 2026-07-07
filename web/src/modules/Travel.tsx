import { useState, type Dispatch, type SetStateAction } from 'react';
import { useAim } from '../hooks/useAim';
import { toISO } from '../lib/dates';
import { applyColSort, nextSortDir, sortCaret, type SortState } from '../lib/sort';
import { moneyFmt, cleanCost, cleanDays } from '../lib/format';
import { parseTravelAnalysts } from '../lib/roster';
import { uid } from '../lib/util';
import { showToast } from '../lib/toast';
import { DateCell } from '../components/DateCell';
import { Modal } from '../components/Modal';
import { Confirm } from '../components/Confirm';
import type { Trip } from '../lib/domain';

type ConfirmState = { title: string; message: string; confirmLabel: string; onConfirm: () => void } | null;

const COLS = ['Date', 'Days', 'City', 'Analyst', 'Monitoring Visits', 'Event/Conference', 'Flight', 'Hotel', 'Car', 'Notes/Other Visits'];
const TRV_KEY: Record<string, keyof Trip> = {
  Date: 'date', Days: 'days', City: 'city', Analyst: 'analyst', 'Monitoring Visits': 'monitoringVisits',
  'Event/Conference': 'event', Flight: 'flight', Hotel: 'hotel', Car: 'car', 'Notes/Other Visits': 'notesOtherVisits',
};

export function Travel() {
  const { state, patch, addTask } = useAim();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [editTrip, setEditTrip] = useState<Partial<Trip> | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [archOpen, setArchOpen] = useState(false);
  // Upcoming + Potential share one sort; Archived sorts independently.
  const [sort, setSort] = useState<SortState>({ key: null, dir: null });
  const [archSort, setArchSort] = useState<SortState>({ key: null, dir: null });

  const trips = state.trips;
  const sortWith = (list: Trip[], s: SortState) => applyColSort(list, s, (t, k) => t[k as keyof Trip]);
  const upcoming = sortWith(trips.filter((t) => t.section === 'upcoming'), sort);
  const potential = sortWith(trips.filter((t) => t.section === 'potential'), sort);
  const archived = sortWith(trips.filter((t) => t.section === 'archived'), archSort);
  const editTripField = (id: string, k: keyof Trip, v: unknown) => patch((s) => { s.trips = s.trips.map((t) => (t.id === id ? { ...t, [k]: v } : t)); });

  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const selIn = (list: Trip[]) => list.filter((t) => sel.has(t.id));
  const moveSection = (ids: string[], section: Trip['section']) => { patch((s) => { s.trips = s.trips.map((t) => (ids.includes(t.id) ? { ...t, section } : t)); }); setSel(new Set()); };

  const doDelete = (list: Trip[]) => {
    const s = selIn(list);
    if (s.length !== 1) { showToast('warning', 'Select exactly one row to delete.'); return; }
    setConfirm({
      title: 'Delete Trip', message: 'Delete this trip? This cannot be undone.', confirmLabel: 'Delete',
      onConfirm: () => { patch((st) => { st.trips = st.trips.filter((t) => t.id !== s[0].id); }); setSel(new Set()); setConfirm(null); showToast('success', 'Trip deleted.'); },
    });
  };
  const addToBandwidth = () => {
    const s = selIn(upcoming);
    if (!s.length) { showToast('warning', 'Select at least one upcoming trip.'); return; }
    let made = 0;
    s.forEach((t) => {
      if (!t.date) { showToast('error', 'Trip is missing a date and cannot be added.'); return; }
      const analysts = parseTravelAnalysts(t.analyst);
      const desc = [t.event, t.monitoringVisits, t.notesOtherVisits].filter(Boolean).join(' · ') + (t.analyst ? ` [orig: ${t.analyst}]` : '');
      const r = addTask({ title: (t.city || 'Trip') + (t.event ? ` — ${t.event}` : ''), description: desc, analysts, label: 'Travel', dueDate: t.date, sourceModule: 'Travel Schedule', sourceId: t.id });
      if (r) made++;
    });
    if (made) showToast('success', `${made} Travel task${made > 1 ? 's' : ''} added to Analyst Bandwidth.`);
  };
  const refreshAnnual = () => {
    setConfirm({
      title: 'Refresh Annual Trips', message: 'Import annual permanent trips into Potential Trips?', confirmLabel: 'Import',
      onConfirm: () => {
        patch((s) => {
          const sources = s.trips.filter((t) => t.permanent && (t.section === 'upcoming' || t.section === 'potential'));
          const copies = sources.map((t) => ({ ...t, id: uid('trip'), section: 'potential' as const, permanent: true, permanentOriginId: t.permanentOriginId || t.id }));
          s.trips = [...s.trips, ...copies];
        });
        setConfirm(null);
        showToast('success', 'Annual permanent trips imported into Potential Trips.');
      },
    });
  };
  const saveTrip = (t: Trip) => {
    patch((s) => {
      if (t.id && s.trips.some((x) => x.id === t.id)) s.trips = s.trips.map((x) => (x.id === t.id ? t : x));
      else s.trips = [...s.trips, { ...t, id: uid('trip') }];
    });
    setEditTrip(null);
    showToast('success', 'Trip saved.');
  };

  const Head = ({ sort, setSort }: { sort: SortState; setSort: Dispatch<SetStateAction<SortState>> }) => (
    <thead><tr><th></th>{COLS.map((c) => { const k = TRV_KEY[c] as string; return <th key={c} className="srt" onClick={() => setSort((s) => nextSortDir(s, k))}>{c} <span className="car">{sortCaret(sort, k)}</span></th>; })}</tr></thead>
  );
  const Row = ({ t }: { t: Trip }) => (
    <tr className={sel.has(t.id) ? 'sel' : ''} onClick={() => setEditTrip(t)} style={{ cursor: 'pointer' }}>
      <td onClick={(e) => { e.stopPropagation(); toggle(t.id); }}><input type="checkbox" className="chk" checked={sel.has(t.id)} readOnly /></td>
      <td className="nowrap" onClick={(e) => e.stopPropagation()}><DateCell value={t.date} onCommit={(v) => editTripField(t.id, 'date', v)} /></td>
      <td className="num">{t.days == null ? '-' : t.days}</td>
      <td className="nowrap">{t.permanent && <span className="star" title="Permanent annual trip">★</span>}{t.city || '-'}</td>
      <td>{t.analyst || '-'}</td>
      <td className="clip" title={t.monitoringVisits}>{t.monitoringVisits || '-'}</td>
      <td className="clip" title={t.event}>{t.event || '-'}</td>
      <td className="num">{moneyFmt(t.flight)}</td>
      <td className="num">{moneyFmt(t.hotel)}</td>
      <td className="num">{moneyFmt(t.car)}</td>
      <td className="clip" title={t.notesOtherVisits}>{t.notesOtherVisits || '-'}</td>
    </tr>
  );
  const emptyRow = (msg: string) => <tr><td colSpan={11} style={{ textAlign: 'center', color: 'var(--muted)', padding: '18px' }}>{msg}</td></tr>;
  const blank = (section: Trip['section']): Partial<Trip> => ({ section, permanent: false, days: null, flight: null, hotel: null, car: null });

  return (
    <div className="module">
      <div className="module-head"><span className="module-title">Travel Schedule</span></div>

      <div className="ribbon">
        <button className="btn gold" onClick={() => setEditTrip(blank('upcoming'))}>New Trip</button>
        <button className="btn ghost" onClick={() => doDelete(upcoming)}>Delete</button>
        <button className="btn" onClick={addToBandwidth}>Add to Analyst Bandwidth</button>
        <button className="btn blue" onClick={() => { const s = selIn(upcoming); if (!s.length) { showToast('warning', 'Select upcoming trips to archive.'); return; } moveSection(s.map((x) => x.id), 'archived'); showToast('success', 'Archived selected trips.'); }}>Archive</button>
        <button className="btn ghost" onClick={() => { const s = selIn(upcoming); if (!s.length) { showToast('warning', 'Select trips first.'); return; } moveSection(s.map((x) => x.id), 'potential'); showToast('success', 'Moved to Potential.'); }}>Potential</button>
      </div>
      <div className="tbl-wrap"><table className="trv-center"><Head sort={sort} setSort={setSort} /><tbody>{upcoming.length ? upcoming.map((t) => <Row key={t.id} t={t} />) : emptyRow('No upcoming trips.')}</tbody></table></div>

      <div className="section-bar"><h3>Potential Trips</h3></div>
      <div className="ribbon">
        <button className="btn gold" onClick={() => setEditTrip(blank('potential'))}>New Trip</button>
        <button className="btn ghost" onClick={() => doDelete(potential)}>Delete</button>
        <button className="btn blue" onClick={() => { const s = selIn(potential); if (!s.length) { showToast('warning', 'Select potential trips first.'); return; } moveSection(s.map((x) => x.id), 'upcoming'); showToast('success', 'Moved to Upcoming.'); }}>Upcoming</button>
        <button className="btn" onClick={refreshAnnual}>Refresh Annual Trips</button>
      </div>
      <div className="tbl-wrap"><table className="trv-center"><Head sort={sort} setSort={setSort} /><tbody>{potential.length ? potential.map((t) => <Row key={t.id} t={t} />) : emptyRow('No potential trips.')}</tbody></table></div>

      <div className="section-bar" onClick={() => setArchOpen((o) => !o)}>
        <span className="chev">{archOpen ? '▼' : '▶'}</span><h3>Archived Trips ({archived.length})</h3>
      </div>
      {archOpen && (
        <>
          <div className="ribbon">
            <button className="btn blue" onClick={() => { const s = selIn(archived); if (!s.length) { showToast('warning', 'Select archived trips first.'); return; } moveSection(s.map((x) => x.id), 'upcoming'); showToast('success', 'Restored to Upcoming.'); }}>Upcoming</button>
          </div>
          <div className="tbl-wrap"><table className="trv-center"><Head sort={archSort} setSort={setArchSort} /><tbody>{archived.length ? archived.map((t) => <Row key={t.id} t={t} />) : emptyRow('No archived trips.')}</tbody></table></div>
        </>
      )}

      {editTrip && <TripEditor trip={editTrip} onSave={saveTrip} onClose={() => setEditTrip(null)} />}
      {confirm && <Confirm {...confirm} onCancel={() => setConfirm(null)} />}
    </div>
  );
}

function TripEditor({ trip, onSave, onClose }: { trip: Partial<Trip>; onSave: (t: Trip) => void; onClose: () => void }) {
  const [t, setT] = useState<Partial<Trip>>({ ...trip });
  const f = (k: keyof Trip, v: unknown) => setT((p) => ({ ...p, [k]: v }));
  return (
    <Modal title={trip.id ? 'Edit Trip' : 'New Trip'} onClose={onClose}
      foot={<><button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn gold" onClick={() => onSave({ ...(t as Trip), days: cleanDays(t.days), flight: cleanCost(t.flight), hotel: cleanCost(t.hotel), car: cleanCost(t.car) })}>Save Trip</button></>}>
      <div className="grid2">
        <div className="field"><label>Date</label><input type="date" value={toISO(t.date) || ''} onChange={(e) => f('date', e.target.value)} /></div>
        <div className="field"><label>Days</label><input type="number" value={t.days ?? ''} onChange={(e) => f('days', e.target.value)} /></div>
      </div>
      <div className="grid2">
        <div className="field"><label>City</label><input type="text" value={t.city || ''} onChange={(e) => f('city', e.target.value)} /></div>
        <div className="field"><label>Analyst</label><input type="text" value={t.analyst || ''} onChange={(e) => f('analyst', e.target.value)} /></div>
      </div>
      <div className="field"><label>Monitoring Visits</label><input type="text" value={t.monitoringVisits || ''} onChange={(e) => f('monitoringVisits', e.target.value)} /></div>
      <div className="field"><label>Event / Conference</label><input type="text" value={t.event || ''} onChange={(e) => f('event', e.target.value)} /></div>
      <div className="grid3">
        <div className="field"><label>Flight ($)</label><input type="text" value={t.flight ?? ''} onChange={(e) => f('flight', e.target.value)} /></div>
        <div className="field"><label>Hotel ($)</label><input type="text" value={t.hotel ?? ''} onChange={(e) => f('hotel', e.target.value)} /></div>
        <div className="field"><label>Car ($)</label><input type="text" value={t.car ?? ''} onChange={(e) => f('car', e.target.value)} /></div>
      </div>
      <div className="field"><label>Notes / Other Visits</label><textarea value={t.notesOtherVisits || ''} onChange={(e) => f('notesOtherVisits', e.target.value)} /></div>
      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13.5px', fontWeight: 600, color: 'var(--navy)' }}>
        <input type="checkbox" className="chk" checked={!!t.permanent} onChange={(e) => f('permanent', e.target.checked)} /> Permanent annual trip (gold ★)
      </label>
    </Modal>
  );
}
