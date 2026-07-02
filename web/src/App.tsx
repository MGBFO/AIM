import { useEffect, useState } from 'react';
import logo from './assets/logo.png';
import { useAuth } from './hooks/useAuth';
import { useAim } from './hooks/useAim';
import { AimProvider } from './components/AimProvider';
import { ToastHost } from './components/ToastHost';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Login } from './components/Login';
import { Dashboard } from './modules/Dashboard';
import { Travel } from './modules/Travel';
import { Monitoring } from './modules/Monitoring';
import { PRC } from './modules/PRC';
import { Bandwidth } from './modules/Bandwidth';
import { Calendar } from './modules/Calendar';

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

export default function App() {
  const { loading, session } = useAuth();
  return (
    <>
      <ToastHost />
      {loading ? (
        <div className="empty" style={{ margin: 80 }}>Loading…</div>
      ) : session ? (
        <AimProvider>
          <Shell />
        </AimProvider>
      ) : (
        <Login />
      )}
    </>
  );
}

function Shell() {
  const { user, signOut } = useAuth();
  const { ready, undo, redo } = useAim();
  const [module, setModule] = useState<ModuleKey>('dashboard');
  const label = user?.user_metadata?.display_name || user?.email || 'Signed in';

  // Ctrl/Cmd+Z / Ctrl+Y / Ctrl+Shift+Z — but let native undo work in fields.
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
        <div className="logo-box">
          <img src={logo} alt="Biltmore wheat mark" />
        </div>
        <div>
          <div className="brand-title">Analysis in Motion</div>
          <div className="brand-sub">BILTMORE FAMILY OFFICE</div>
        </div>
        <nav className="nav">
          {NAV.map(([k, l]) => (
            <button key={k} className={module === k ? 'active' : ''} onClick={() => setModule(k)}>
              {l}
            </button>
          ))}
        </nav>
        <div className="hist-btns">
          <button title="Undo (Ctrl+Z)" aria-label="Undo" onClick={undo}>↶</button>
          <button title="Redo (Ctrl+Y)" aria-label="Redo" onClick={redo}>↷</button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 10 }}>
          <span className="brand-sub" title={user?.email ?? ''} style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {label}
          </span>
          <button className="btn ghost sm" onClick={() => void signOut()}>Sign out</button>
        </div>
      </header>
      <ErrorBoundary key={module}>
        {ready ? <Active /> : <div className="empty" style={{ margin: 60 }}>Loading data…</div>}
      </ErrorBoundary>
    </>
  );
}
