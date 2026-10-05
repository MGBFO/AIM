import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RolloverModal } from './Monitoring';
import type { Monitoring } from '../lib/domain';

const mon = (p: Partial<Monitoring>): Monitoring => ({
  id: 'm1', fund: 'Acme', analyst: 'Mike Gregory', level: 'Level 1', mostRecent: '2026-06-10',
  monitoringDate: '2026-08-02', status: 'In Progress', annualOnsite: false, complianceCheck: false,
  targetMonitoringDays: 14, archived: false, ...p,
});

describe('RolloverModal — non-compliant diagnostics', () => {
  it('does NOT block on a date mismatch — Run Rollover stays enabled, no blocker table', () => {
    // monitoringDate 2026-08-02 is never (rollover + 14); rollover will just set it.
    render(<RolloverModal active={[mon({})]} onClose={() => {}} onRun={() => {}} />);
    expect(screen.getByRole('button', { name: 'Run Rollover' })).toBeEnabled();
    expect(screen.getByText(/All applicable records comply/i)).toBeInTheDocument();
    expect(screen.queryByText('Issue')).not.toBeInTheDocument(); // no blocker table
  });

  it('BLOCKS a Completed record with no date evidence, and exposes the diagnostic columns', () => {
    render(<RolloverModal active={[mon({ fund: 'Acme', status: 'Completed', mostRecent: null, monitoringDate: null })]} onClose={() => {}} onRun={() => {}} />);
    // diagnostic columns present on the blocker table
    ['Status', 'Most Recent Date', 'Monitoring Date', 'Target Days', 'Expected Monitoring Date', 'Issue'].forEach((h) =>
      expect(screen.getByText(h)).toBeInTheDocument());
    // STORED status shown verbatim; clear issue; id hidden
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getByText(/no completion evidence/i)).toBeInTheDocument();
    expect(screen.queryByText('m1')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Run Rollover' })).toBeDisabled();
  });
});
