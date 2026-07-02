import { useState } from 'react';
import logo from './assets/logo.png';

/**
 * App shell — header, brand, nav, and undo/redo buttons ported from the spec.
 * Modules are stubs for now (Step 1 scaffold). Real modules land in later
 * versions per the delivery sequencing. Nav order is fixed and must match spec.
 */
const NAV: [ModuleKey, string][] = [
  ['dashboard', 'Dashboard'],
  ['travel', 'Travel Schedule'],
  ['monitoring', 'Monitoring Process'],
  ['prc', 'Portfolio Research Committee'],
  ['bandwidth', 'Analyst Bandwidth'],
  ['calendar', 'Workflow Calendar'],
];

type ModuleKey = 'dashboard' | 'travel' | 'monitoring' | 'prc' | 'bandwidth' | 'calendar';

export default function App() {
  const [module, setModule] = useState<ModuleKey>('dashboard');

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
      </header>
      <main className="module">
        <div className="module-head">
          <div className="module-title">{NAV.find(([k]) => k === module)?.[1]}</div>
          <div className="module-meta">Scaffold — module not yet ported</div>
        </div>
        <div className="empty">
          This is the Step&nbsp;1 scaffold. The <b>{module}</b> module will be ported against
          seeded Supabase data in a later version.
        </div>
      </main>
    </>
  );
}
