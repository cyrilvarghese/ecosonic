import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RulebookPage from './page';

const openRule = async (id: string) => {
  await userEvent.click(screen.getByRole('button', { name: new RegExp(`^§${id.replace('.', '\\.')}`) }));
};

describe('RulebookPage', () => {
  it('lists every section and rule as an index', () => {
    render(<RulebookPage />);
    expect(screen.getByRole('heading', { level: 1, name: /remix/i })).toBeInTheDocument();
    expect(screen.getByText(/43 rules · 10 sections/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^§3\.6/ })).toBeInTheDocument();
  });

  it('keeps a rule closed until asked, then shows its prose', async () => {
    render(<RulebookPage />);
    expect(screen.queryByText(/A rule can only sound through an element/)).toBeNull();

    await openRule('3.6');

    expect(screen.getByText(/A rule can only sound through an element/)).toBeInTheDocument();
  });

  it('filters to matching rules and counts them', async () => {
    render(<RulebookPage />);
    await userEvent.type(screen.getByLabelText(/search the rules/i), 'whole loops');

    expect(screen.getByText(/of 43 rules/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^§5\.1/ })).toBeNull();
  });

  it('searches the body, not only the titles', async () => {
    render(<RulebookPage />);
    // "mulberry"-style body-only phrasing: this sentence lives in §3.9a's prose.
    await userEvent.type(screen.getByLabelText(/search the rules/i), 'records the seed');

    expect(screen.getByRole('button', { name: /^§3\.9a/ })).toBeInTheDocument();
  });

  it('says so plainly when nothing matches', async () => {
    render(<RulebookPage />);
    await userEvent.type(screen.getByLabelText(/search the rules/i), 'zzzznotarule');
    expect(screen.getByText(/nothing matches/i)).toBeInTheDocument();
  });
});

describe('RulebookPage — live evidence', () => {
  it('marks the rules that carry live data', () => {
    render(<RulebookPage />);
    const row = screen.getByRole('button', { name: /^§3\.6/ });
    expect(within(row).getByText('live')).toBeInTheDocument();
    // …and a rule without evidence carries no badge.
    expect(within(screen.getByRole('button', { name: /^§5\.2/ })).queryByText('live')).toBeNull();
  });

  it('shows the coverage of the real library under §3.6, flagging what cannot sound', async () => {
    render(<RulebookPage />);
    await openRule('3.6');

    const panel = screen.getByTestId('live-panel');
    expect(within(panel).getByText(/what the library actually covers/i)).toBeInTheDocument();
    // ETHER authors an ELEMENT_SUB rule and ships no sample — the one real gap.
    expect(within(panel).getByText(/Dead: ELEMENT_SUB·ETHER/)).toBeInTheDocument();
  });

  it('names the real planet bodies under §3.5a', async () => {
    render(<RulebookPage />);
    await openRule('3.5a');

    const panel = screen.getByTestId('live-panel');
    expect(within(panel).getByText(/MERCURY · SUN/)).toBeInTheDocument();
  });

  it('shows AIR’s disagreeing section windows under §2.3', async () => {
    render(<RulebookPage />);
    await openRule('2.3');

    const panel = screen.getByTestId('live-panel');
    expect(within(panel).getByText('9:30')).toBeInTheDocument();
  });

  it('shows the categories that do not start dry at unity under §5a.7', async () => {
    render(<RulebookPage />);
    await openRule('5a.7');

    const panel = screen.getByTestId('live-panel');
    expect(within(panel).getByText('NOISE')).toBeInTheDocument();
    expect(within(panel).getByText('-20 dB')).toBeInTheDocument();
  });
});
