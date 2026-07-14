import { useCallback, useState } from 'react';
import { getUserPref, setUserPref } from '../lib/userPrefs';

/* ============================================================================
   "Save View": persist a module's filter selections per user. Values are read
   synchronously from the warm user-prefs cache (see lib/userPrefs) and written
   through to the server (user_prefs table) + localStorage cache. Keyed per
   module.
   ========================================================================== */

type Saved = { on: boolean; v: Record<string, unknown> };
const prefKey = (module: string) => `view.${module}`;

export function useSavedView(module: string) {
  const [initial] = useState<Saved>(() => {
    const s = getUserPref<Saved>(prefKey(module));
    return s && s.on ? { on: true, v: s.v || {} } : { on: false, v: {} };
  });
  const [saveView, setSaveView] = useState(initial.on);

  // Call whenever the tracked filter values change. Writes while the box is
  // checked; clears the saved view when unchecked (defaults return next visit).
  const save = useCallback(
    (values: Record<string, unknown>) => {
      setUserPref(prefKey(module), saveView ? { on: true, v: values } : { on: false, v: {} });
    },
    [module, saveView],
  );

  return { initial, saveView, setSaveView, save };
}
