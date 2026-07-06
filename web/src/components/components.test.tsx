import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Modal } from './Modal';
import { Confirm } from './Confirm';
import { AnalystPicker } from './AnalystPicker';
import { SortHeader } from './SortHeader';
import type { SortState } from '../lib/sort';

// Fail loudly on any console.error during render (render-walk discipline).
let errSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  expect(errSpy).not.toHaveBeenCalled();
  errSpy.mockRestore();
});

describe('Modal', () => {
  it('renders title + children and closes on Escape', () => {
    const onClose = vi.fn();
    render(
      <Modal title="Hello" onClose={onClose}>
        body text
      </Modal>,
    );
    expect(screen.getByText('Hello')).toBeInTheDocument();
    expect(screen.getByText('body text')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe('Confirm', () => {
  it('fires the right callbacks', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<Confirm message="Sure?" onConfirm={onConfirm} onCancel={onCancel} />);
    fireEvent.click(screen.getByText('Confirm'));
    fireEvent.click(screen.getByText('Cancel'));
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onCancel).toHaveBeenCalledOnce();
  });
});

describe('AnalystPicker', () => {
  it('Unassigned is exclusive; selecting a name clears it', () => {
    const onChange = vi.fn();
    render(<AnalystPicker value={['Unassigned']} onChange={onChange} />);
    fireEvent.click(screen.getByText('Mike Gregory'));
    expect(onChange).toHaveBeenCalledWith(['Mike Gregory']);
  });
  it('selecting Unassigned resets to just Unassigned', () => {
    const onChange = vi.fn();
    render(<AnalystPicker value={['Mike Gregory', 'Jack Griffin']} onChange={onChange} />);
    fireEvent.click(screen.getByText('Unassigned'));
    expect(onChange).toHaveBeenCalledWith(['Unassigned']);
  });
});

describe('SortHeader', () => {
  it('cycles sort direction and shows caret', () => {
    const onSort = vi.fn();
    const sort: SortState = { key: 'city', dir: 'asc' };
    render(
      <table>
        <thead>
          <tr>
            <SortHeader sortKey="city" label="City" sort={sort} onSort={onSort} />
          </tr>
        </thead>
      </table>,
    );
    const th = screen.getByText('City');
    expect(th.textContent).toContain('▲');
    fireEvent.click(th);
    expect(onSort).toHaveBeenCalledWith({ key: 'city', dir: 'desc' });
  });
});
