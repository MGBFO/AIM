import { useMemo } from 'react';
import { AuthContext, type AuthState } from '../hooks/useAuth';
import { DEMO_STORAGE_KEY } from '../lib/config';
import { DemoProvider } from './DemoProvider';
import { Shell } from './Shell';

/** Local demo root: a fake auth context (no real sign-in) + the in-browser
    demo store. "Sign out" resets the local demo data. */
export default function DemoApp() {
  const auth = useMemo<AuthState>(() => ({
    session: {} as never,
    user: { email: 'demo (local)', user_metadata: { display_name: 'Demo (local)' } } as never,
    loading: false,
    signIn: async () => ({}),
    signUp: async () => ({}),
    signOut: async () => {
      try { localStorage.removeItem(DEMO_STORAGE_KEY); } catch { /* ignore */ }
      window.location.reload();
    },
  }), []);

  return (
    <AuthContext.Provider value={auth}>
      <DemoProvider>
        <Shell />
      </DemoProvider>
    </AuthContext.Provider>
  );
}
