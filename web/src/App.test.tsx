import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App';

// Force the live (Supabase) path so we can test the auth gate.
vi.mock('./lib/config', () => ({ DEMO: false, DEMO_STORAGE_KEY: 'aim.demo.test' }));

// Mock the supabase client so no network/DB is needed.
const getSession = vi.fn();
vi.mock('./lib/supabase', () => {
  const query = { select: () => Promise.resolve({ data: [], error: null }) };
  const channel = { on() { return this; }, subscribe() { return this; } };
  return {
    supabase: {
      auth: {
        getSession: () => getSession(),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
        signInWithPassword: vi.fn(),
        signUp: vi.fn(),
        signOut: vi.fn(),
      },
      from: () => query,
      channel: () => channel,
      removeChannel: vi.fn(),
    },
  };
});

beforeEach(() => getSession.mockReset());

describe('App auth gating (live mode)', () => {
  it('shows the Login screen when there is no session', async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    render(<App />);
    expect(await screen.findByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('shows the app shell (nav) when authenticated', async () => {
    getSession.mockResolvedValue({ data: { session: { user: { email: 'a@b.com', user_metadata: {} } } } });
    render(<App />);
    expect(await screen.findByRole('button', { name: 'Analyst Bandwidth' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument();
  });
});
