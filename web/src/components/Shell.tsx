import { useEffect, useState } from 'react';
import logo from '../assets/logo.png';
import { useAuth } from '../hooks/useAuth';
import { useAim } from '../hooks/useAim';
import { setUserPref } from '../lib/userPrefs';
import { soundEnabled, soundVolume, playCompletion, primeCompletionSound } from '../lib/sound';
import { ErrorBoundary } from './ErrorBoundary';
import { Dashboard } from '../modules/Dashboard';
import { Travel } from '../modules/Travel';
import { Monitoring } from '../modules/Monitoring';
import { PRC } from '../modules/PRC';
import { Bandwidth } from '../modules/Bandwidth';
import { Calendar } from '../modules/Calendar';

type ModuleKey = 'dashboard' | 'travel' | 'monitoring' | 'prc' | 'bandwidth' | 'calendar';

/** Fixed nav order — must match the spec. */
const NAV: [ModuleKey, string][] = [
  ['dashboard', 'Dashboard'],
  ['travel', 'Travel Schedule'],
  ['monitoring', 'Monitoring Process'],
  ['prc', 'Portfolio Research Committee'],
  ['bandwidth', 'Analyst Bandwidth'],
  ['calendar', 'Workflow Calendar'],
];

const MODULES: Record<ModuleKey, () => JSX.Element> = {
  dashboard: Dashboard,
  travel: Travel,
  monitoring: Monitoring,
  prc: PRC,
  bandwidth: Bandwidth,
  calendar: Calendar,
};

/** Authenticated app shell: header, brand, nav, undo/redo, sign-out. Shared by
    the live (Supabase) and demo (local) roots. */
export function Shell() {
  const { user, signOut } = useAuth();
  const { ready, undo, redo } = useAim();
  const [module, setModule] = useState<ModuleKey>('dashboard');
  const label = user?.user_metadata?.display_name || user?.email || 'Signed in';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const el = e.target as HTMLElement | null;
      const tag = (el?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || el?.isContentEditable) return;
      const k = (e.key || '').toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  const Active = MODULES[module];

  return (
    <>
      <header className="app-header">
        <div className="logo-box"><img src={logo} alt="Biltmore wheat mark" /></div>
        <div>
          <div className="brand-title">Analysis in Motion</div>
          <div className="brand-sub">BILTMORE FAMILY OFFICE</div>
        </div>
        <nav className="nav">
          {NAV.map(([k, l]) => (
            <button key={k} className={module === k ? 'active' : ''} onClick={() => setModule(k)}>{l}</button>
          ))}
        </nav>
        <div className="hist-btns">
          <button title="Undo (Ctrl+Z)" aria-label="Undo" onClick={undo}>↶</button>
          <button title="Redo (Ctrl+Y)" aria-label="Redo" onClick={redo}>↷</button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 10 }}>
          <SoundSettings />
          <span className="brand-sub" title={user?.email ?? ''} style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
          <button className="btn ghost sm" onClick={() => void signOut()}>Sign out</button>
        </div>
      </header>
      <ErrorBoundary key={module}>
        {ready ? <Active /> : <div className="empty" style={{ margin: 60 }}>Loading data…</div>}
      </ErrorBoundary>
    </>
  );
}

/** Header control: toggle the completion chime and set its volume (per user). */
function SoundSettings() {
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(soundEnabled());
  const [volume, setVolume] = useState(Math.round(soundVolume() * 100));

  useEffect(() => { primeCompletionSound(); }, []);

  const toggle = (v: boolean) => { setEnabled(v); setUserPref('sound.enabled', v); };
  const changeVol = (v: number) => { setVolume(v); setUserPref('sound.volume', v / 100); };

  return (
    <div style={{ position: 'relative' }}>
      <button className="btn ghost sm" title="Completion sound" aria-label="Completion sound settings" onClick={() => setOpen((o) => !o)}>
        {enabled ? '🔊' : '🔇'}
      </button>
      {open && (
        <div className="sound-pop" onMouseLeave={() => setOpen(false)}>
          <label className="save-view" style={{ fontSize: 13 }}>
            <input type="checkbox" className="chk" checked={enabled} onChange={(e) => toggle(e.target.checked)} /> Completion sound
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="mini">Volume</span>
            <input type="range" min={0} max={100} value={volume} disabled={!enabled} onChange={(e) => changeVol(Number(e.target.value))} style={{ flex: 1 }} />
          </div>
          <button className="btn ghost sm" disabled={!enabled} onClick={() => playCompletion()}>Test sound</button>
        </div>
      )}
    </div>
  );
}
