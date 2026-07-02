/* ============================================================================
   Toast registry — ported from Analysis_in_Motion_V5.html. A module-level
   register lets any code call showToast() without prop-drilling. The <ToastHost>
   component registers the sink. Kept separate from the component file so Vite
   fast-refresh (and eslint react-refresh) only sees component exports there.
   ========================================================================== */

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastInput {
  type: ToastType;
  message: string;
  undo?: () => void;
}

type Sink = (t: ToastInput) => void;

let sink: Sink | null = null;

/** Called by <ToastHost> to register/unregister the active sink. */
export function registerToastSink(fn: Sink | null): void {
  sink = fn;
}

export function showToast(type: ToastType, message: string, opts?: { undo?: () => void }): void {
  try {
    if (sink) sink({ type: type || 'info', message: message || '', undo: opts?.undo });
    else console.log('[toast]', type, message);
  } catch (e) {
    console.error('toast error', e);
  }
}
