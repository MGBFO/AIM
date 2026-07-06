import { lazy, Suspense } from 'react';
import { useAuth } from './hooks/useAuth';
import { AuthProvider } from './components/AuthProvider';
import { AimProvider } from './components/AimProvider';
import { ToastHost } from './components/ToastHost';
import { Login } from './components/Login';
import { Shell } from './components/Shell';
import { DEMO } from './lib/config';

// Demo code + its seed only load when actually in demo mode.
const DemoApp = lazy(() => import('./components/DemoApp'));

const Loading = () => <div className="empty" style={{ margin: 80 }}>Loading…</div>;

export default function App() {
  return (
    <>
      <ToastHost />
      {DEMO ? (
        <Suspense fallback={<Loading />}>
          <DemoApp />
        </Suspense>
      ) : (
        <LiveApp />
      )}
    </>
  );
}

/** Real backend: Supabase auth gate around the shared shell. */
function LiveApp() {
  return (
    <AuthProvider>
      <AuthedRoot />
    </AuthProvider>
  );
}

function AuthedRoot() {
  const { loading, session } = useAuth();
  if (loading) return <Loading />;
  if (!session) return <Login />;
  return (
    <AimProvider>
      <Shell />
    </AimProvider>
  );
}
