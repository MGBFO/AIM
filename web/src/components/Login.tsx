import { useState, type FormEvent } from 'react';
import { useAuth } from '../hooks/useAuth';
import { showToast } from '../lib/toast';
import logo from '../assets/logo.png';

/** Email/password sign-in / sign-up screen (Supabase Auth). */
export function Login() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === 'signin') {
        const { error } = await signIn(email.trim(), password);
        if (error) showToast('error', error);
      } else {
        const { error } = await signUp(email.trim(), password, displayName.trim());
        if (error) showToast('error', error);
        else showToast('success', 'Account created. Check your email if confirmation is required, then sign in.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="overlay" style={{ alignItems: 'center', background: 'var(--bg)' }}>
      <div className="modal" style={{ maxWidth: 400 }}>
        <div className="modal-head" style={{ gap: 12 }}>
          <div className="logo-box" style={{ width: 32, height: 38 }}>
            <img src={logo} alt="Biltmore wheat mark" />
          </div>
          <span>Analysis in Motion</span>
        </div>
        <form onSubmit={submit}>
          <div className="modal-body">
            {mode === 'signup' && (
              <div className="field">
                <label htmlFor="dn">Display name</label>
                <input
                  id="dn"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  autoComplete="name"
                  required
                />
              </div>
            )}
            <div className="field">
              <label htmlFor="em">Email</label>
              <input
                id="em"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </div>
            <div className="field">
              <label htmlFor="pw">Password</label>
              <input
                id="pw"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                required
              />
            </div>
            <button type="button" className="btn ghost sm" style={{ alignSelf: 'flex-start' }}
              onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>
              {mode === 'signin' ? 'Need an account? Sign up' : 'Have an account? Sign in'}
            </button>
          </div>
          <div className="modal-foot">
            <button type="submit" className="btn gold" disabled={busy}>
              {busy ? 'Working…' : mode === 'signin' ? 'Sign in' : 'Create account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
