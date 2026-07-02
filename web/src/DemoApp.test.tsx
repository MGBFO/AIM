import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App';

// Force DEMO mode: no backend, seeded from the reference data.
vi.mock('./lib/config', () => ({ DEMO: true, DEMO_STORAGE_KEY: 'aim.demo.test' }));

let errSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  localStorage.clear();
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  expect(errSpy).not.toHaveBeenCalled(); // render-walk: no console errors
  errSpy.mockRestore();
});

describe('Demo mode', () => {
  it('boots the shell and renders the Dashboard from seeded data', async () => {
    render(<App />);
    // lazy DemoApp + async provider load
    expect(await screen.findByText('Most Recent 5 Trips')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByText('Demo (local)')).toBeInTheDocument();
    // dashboard panels render (unique headings)
    expect(screen.getByText('Useful Links')).toBeInTheDocument();
    expect(screen.getByText('Next Upcoming 5 Trips')).toBeInTheDocument();
  });
});
