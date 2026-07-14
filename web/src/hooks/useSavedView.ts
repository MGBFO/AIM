import { useCallback, useState } from 'react';

/* ============================================================================
   "Save View": persist a module's filter selections in the browser so they
   survive navigating away and back (and page reloads). Stored in localStorage
   — per browser/login, which in practice is per user (each analyst signs in on
   their own machine). Keyed per module.
   ========================================================================== */

const keyFor = (module: string) => `aim.view.${module}`;

function load(module: string): { on: boolean; v: Record<string, unknown> } {
  try {
    const raw = localStorage.getItem(keyFor(module));
    if (raw) {
      const p = JSON.parse(raw);
      if (p && p.on) return { on: true, v: (p.v as Record<string, unknown>) || {} };
    }
  } catch {
    /* ignore malformed/unavailable storage */
  }
  return { on: false, v: {} };
}

export function useSavedView(module: string) {
  const [initial] = useState(() => load(module)); // read once, at mount
  const [saveView, setSaveView] = useState(initial.on);

  // Call whenever the tracked filter values change. Writes while the box is
  // checked; clears the saved view when unchecked (so defaults return next visit).
  const save = useCallback(
    (values: Record<string, unknown>) => {
      try {
        if (saveView) localStorage.setItem(keyFor(module), JSON.stringify({ on: true, v: values }));
        else localStorage.removeItem(keyFor(module));
      } catch {
        /* ignore */
      }
    },
    [module, saveView],
  );

  return { initial, saveView, setSaveView, save };
}
