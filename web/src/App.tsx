import { useState } from 'react';
import logo from './assets/logo.png';
import { useAuth } from './hooks/useAuth';
import { ToastHost } from './components/ToastHost';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Login } from './components/Login';

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

export default function App() {
  const { loading, session } = useAuth();
  return (
    <>
      <ToastHost />
      {loading ? (
        <div className="empty" style={{ margin: 80 }}>Loading…</div>
      ) : session ? (
        <Shell />
      ) : (
        <Login />
      )}
    </>
  );
}

/** Authenticated app shell: header, brand, nav, undo/redo, sign-out. */
function Shell() {
  const { user, signOut } = useAuth();
  const [module, setModule] = useState<ModuleKey>('dashboard');
  const label = user?.user_metadata?.display_name || user?.email || 'Signed in';

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
          <button title="Undo (Ctrl+Z)" aria-label="Undo">↶</button>
          <button title="Redo (Ctrl+Y)" aria-label="Redo">↷</button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 10 }}>
          <span className="brand-sub" title={user?.email ?? ''} style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {label}
          </span>
          <button className="btn ghost sm" onClick={() => void signOut()}>Sign out</button>
        </div>
      </header>
      <ErrorBoundary key={module}>
        <main className="module">
          <div className="module-head">
            <div className="module-title">{NAV.find(([k]) => k === module)?.[1]}</div>
            <div className="module-meta">Module not yet ported</div>
          </div>
          <div className="empty">
            Auth &amp; app shell are live. The <b>{module}</b> module will be ported against
            seeded Supabase data in V3.
          </div>
        </main>
      </ErrorBoundary>
    </>
  );
}
