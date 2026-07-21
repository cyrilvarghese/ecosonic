import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RuleLibrary } from '@/components/rules/RuleLibrary';

const noop = () => {};

describe('RuleLibrary live-grammar toggle', () => {
  it('defaults to the timeline view (legend visible, no table header)', () => {
    render(<RuleLibrary discovered={[]} onPromote={noop} onDiscard={noop} />);
    expect(screen.getByText('bed')).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'present' })).toBeNull();
  });
  it('switches to the table when Table is clicked', async () => {
    render(<RuleLibrary discovered={[]} onPromote={noop} onDiscard={noop} />);
    await userEvent.click(screen.getByRole('button', { name: 'table' }));
    expect(screen.getByRole('columnheader', { name: 'present' })).toBeInTheDocument();
    expect(screen.queryByText('bed')).toBeNull();
  });
});
