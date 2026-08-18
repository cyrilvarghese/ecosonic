import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RulebookPage from './page';

const openRule = async (id: string) => {
  await userEvent.click(screen.getByRole('button', { name: new RegExp(`^§${id.replace('.', '\\.')}`) }));
};

describe('RulebookPage', () => {
  it('lists every section and rule as an index', () => {
    render(<RulebookPage />);
    expect(screen.getByRole('heading', { level: 1, name: /remix/i })).toBeInTheDocument();
    expect(screen.getByText(/47 rules · 11 sections/)).toBeInTheDocument();
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

    expect(screen.getByText(/of 47 rules/)).toBeInTheDocument();
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

describe('RulebookPage — language switch', () => {
  beforeEach(() => window.localStorage.clear());

  it('starts in English with both languages offered', () => {
    render(<RulebookPage />);
    expect(screen.getByRole('button', { name: 'EN' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'IT' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('switches the rules themselves, not just the chrome', async () => {
    render(<RulebookPage />);
    expect(screen.getByText(/Choosing what plays/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'IT' }));

    expect(screen.getByText(/Scegliere cosa suona/)).toBeInTheDocument();
    expect(screen.queryByText(/Choosing what plays/)).toBeNull();
    expect(screen.getByText(/47 regole · 11 sezioni/)).toBeInTheDocument();
  });

  it('translates the search control and says the translation is approximate', async () => {
    render(<RulebookPage />);
    await userEvent.click(screen.getByRole('button', { name: 'IT' }));

    expect(screen.getByLabelText(/cerca nelle regole/i)).toBeInTheDocument();
    // The caveat lives in the doc's own intro, so it appears exactly once.
    expect(screen.getByText(/traduzione approssimativa/i)).toBeInTheDocument();
  });

  it('remembers the choice', async () => {
    const { unmount } = render(<RulebookPage />);
    await userEvent.click(screen.getByRole('button', { name: 'IT' }));
    unmount();

    render(<RulebookPage />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'IT' })).toHaveAttribute('aria-pressed', 'true'));
    expect(screen.getByText(/Scegliere cosa suona/)).toBeInTheDocument();
  });

  it('keeps a rule’s live panel working in Italian', async () => {
    render(<RulebookPage />);
    await userEvent.click(screen.getByRole('button', { name: 'IT' }));
    await userEvent.click(screen.getByRole('button', { name: /^§3\.6/ }));

    const panel = screen.getByTestId('live-panel');
    expect(within(panel).getByText(/cosa copre davvero la libreria/i)).toBeInTheDocument();
    // The data itself is language-neutral and still there.
    expect(within(panel).getByText(/ELEMENT_SUB·ETHER/)).toBeInTheDocument();
  });

  it('searches the Italian text when Italian is showing', async () => {
    render(<RulebookPage />);
    await userEvent.click(screen.getByRole('button', { name: 'IT' }));
    await userEvent.type(screen.getByLabelText(/cerca nelle regole/i), 'corsia');

    expect(screen.getByText(/di 47 regole/)).toBeInTheDocument();
  });
});
