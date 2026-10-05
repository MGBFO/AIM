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
  it('exposes stored Status, Most Recent Date, and the Issue text for a blocking row', () => {
    // Level 1 applies to every rollover boundary, and monitoringDate 2026-08-02 is
    // never (rollover + 14) — those land on a 15th — so this row blocks regardless
    // of which rollover date is defaulted/selected.
    render(<RolloverModal active={[mon({})]} onClose={() => {}} onRun={() => {}} />);

    // diagnostic columns present
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Most Recent Date')).toBeInTheDocument();
    expect(screen.getByText('Monitoring Date')).toBeInTheDocument();
    expect(screen.getByText('Target Days')).toBeInTheDocument();
    expect(screen.getByText('Expected Monitoring Date')).toBeInTheDocument();
    expect(screen.getByText('Issue')).toBeInTheDocument();

    // STORED status is shown verbatim (not the computed "Overdue")
    expect(screen.getByText('In Progress')).toBeInTheDocument();
    // the issue reason renders
    expect(screen.getByText(/does not match the Expected Monitoring Date/i)).toBeInTheDocument();
    // a mm/dd/yyyy date (Most Recent) is shown, internal id is not
    expect(screen.getByText('06/10/2026')).toBeInTheDocument();
    expect(screen.queryByText('m1')).not.toBeInTheDocument();
  });
});
