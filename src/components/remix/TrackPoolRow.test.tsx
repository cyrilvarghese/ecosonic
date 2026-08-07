import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AuthoredRule } from '@/remix/sessionRules';
import { config } from '@/config';
import { ruleKey, slotKey } from '@/remix/pins';
import { TrackPoolRow } from './TrackPoolRow';

const rule = (
  phrases: AuthoredRule['phrases'],
  section: AuthoredRule['section'] = 'INTRODUCTION',
  sessionId = 'water-session-layer-timeline',
): AuthoredRule => ({
  category: 'MELODY', section, sectionStartSec: 0, phrases,
  source: { element: 'WATER', sessionId, track: 'MELODY' },
});

const noop = () => {};

describe('TrackPoolRow', () => {
  it('names the element, section and interval on hover', () => {
    const r = rule([{ enterSec: 60, exitSec: 540, fadeInSec: 0, fadeOutSec: 0 }]);
    render(<TrackPoolRow category="MELODY" candidates={[r]} picked={new Set()} />);
    expect(screen.getByText('Water·I'))
      .toHaveAttribute('title', 'WATER · water-session-layer-timeline · Introduction · 1:00–9:00');
  });

  it('lists every phrase of a multi-phrase rule', () => {
    const r = rule([
      { enterSec: 165, exitSec: 273, fadeInSec: 0, fadeOutSec: 0 },
      { enterSec: 327, exitSec: 435, fadeInSec: 0, fadeOutSec: 0 },
    ]);
    render(<TrackPoolRow category="MELODY" candidates={[r]} picked={new Set()} />);
    expect(screen.getByText('Water·I'))
      .toHaveAttribute('title',
        'WATER · water-session-layer-timeline · Introduction · 2:45–4:33, 5:27–7:15');
  });

  it('lights every rule the draw picked, not just one', () => {
    const intro = rule([{ enterSec: 0, exitSec: 600, fadeInSec: 0, fadeOutSec: 0 }], 'INTRODUCTION');
    const ret = rule([{ enterSec: 1200, exitSec: 1800, fadeInSec: 0, fadeOutSec: 0 }], 'RETURN');
    const unpicked = rule([{ enterSec: 600, exitSec: 1200, fadeInSec: 0, fadeOutSec: 0 }], 'DEEP_RELAXATION');
    render(
      <TrackPoolRow category="MELODY" candidates={[intro, unpicked, ret]} picked={new Set([intro, ret])} />,
    );
    const lit = (text: string) => screen.getByText(text).className.includes('bg-[var(--accent-ink)]');
    expect(lit('Water·I')).toBe(true);
    expect(lit('Water·Rt')).toBe(true);
    expect(lit('Water·Rx')).toBe(false);
  });

  it('spells out the section a chip abbreviates', () => {
    const r = rule([{ enterSec: 1200, exitSec: 1500, fadeInSec: 0, fadeOutSec: 0 }], 'DEEP_RELAXATION');
    render(<TrackPoolRow category="MELODY" candidates={[r]} picked={new Set()} />);
    expect(screen.getByText('Water·Rx'))
      .toHaveAttribute('title',
        'WATER · water-session-layer-timeline · Deep Relaxation · 20:00–25:00');
  });

  it('names the session, so two sessions of one element can be told apart', () => {
    const ocean = rule([{ enterSec: 0, exitSec: 60, fadeInSec: 0, fadeOutSec: 0 }], 'INTRODUCTION', 'water-ocean');
    render(<TrackPoolRow category="MELODY" candidates={[ocean]} picked={new Set()} />);
    expect(screen.getByText('Water·I')).toHaveAttribute('title', expect.stringContaining('water-ocean'));
  });

  it('leaves the session off when it adds nothing beyond the element', () => {
    const r = rule([{ enterSec: 0, exitSec: 60, fadeInSec: 0, fadeOutSec: 0 }], 'INTRODUCTION', 'WATER');
    render(<TrackPoolRow category="MELODY" candidates={[r]} picked={new Set()} />);
    expect(screen.getByText('Water·I')).toHaveAttribute('title', 'WATER · Introduction · 0:00–1:00');
  });

  it('tags each chip with its element so it takes that element colour', () => {
    const r = rule([{ enterSec: 0, exitSec: 60, fadeInSec: 0, fadeOutSec: 0 }]);
    render(<TrackPoolRow category="MELODY" candidates={[r]} picked={new Set()} />);
    expect(screen.getByText('Water·I')).toHaveAttribute('data-element', 'water');
  });

  it('renders a slider for each send, at the current value', () => {
    render(
      <TrackPoolRow
        category="MELODY" candidates={[]} picked={new Set()}
        sends={{ reverb: 0.2, delay: 0.1 }} onSend={noop}
      />,
    );
    expect((screen.getByLabelText('Reverb send') as HTMLInputElement).value).toBe('0.2');
    expect((screen.getByLabelText('Delay send') as HTMLInputElement).value).toBe('0.1');
  });

  it('reports the kind and the new value on change', () => {
    const onSend = vi.fn();
    render(
      <TrackPoolRow
        category="MELODY" candidates={[]} picked={new Set()}
        sends={{ reverb: 0, delay: 0 }} onSend={onSend}
      />,
    );
    fireEvent.change(screen.getByLabelText('Reverb send'), { target: { value: '0.5' } });
    expect(onSend).toHaveBeenCalledWith('reverb', 0.5);
  });
});

describe('TrackPoolRow — volume', () => {
  it('renders a slider at the current level, read out in dB', () => {
    render(
      <TrackPoolRow
        category="MELODY" candidates={[]} picked={new Set()}
        volumeDb={-9} onVolume={noop}
      />,
    );
    expect((screen.getByLabelText('Volume') as HTMLInputElement).value).toBe('-9');
    expect(screen.getByText('-9 dB')).toBeInTheDocument();
  });

  it('reports the new level in dB, not as a fraction', () => {
    const onVolume = vi.fn();
    render(
      <TrackPoolRow
        category="MELODY" candidates={[]} picked={new Set()}
        volumeDb={0} onVolume={onVolume}
      />,
    );
    fireEvent.change(screen.getByLabelText('Volume'), { target: { value: '-6' } });
    expect(onVolume).toHaveBeenCalledWith(-6);
  });

  it('spans the track range, so a buried lane can be lifted as well as cut', () => {
    render(
      <TrackPoolRow
        category="MELODY" candidates={[]} picked={new Set()}
        volumeDb={0} onVolume={noop}
      />,
    );
    const slider = screen.getByLabelText('Volume') as HTMLInputElement;
    expect(slider.min).toBe(String(config.audio.volume.trackMinDb));
    expect(slider.max).toBe(String(config.audio.volume.trackMaxDb));
  });

  it('renders no slider for a row given no level, as with the sends', () => {
    render(<TrackPoolRow category="MELODY" candidates={[]} picked={new Set()} />);
    expect(screen.queryByLabelText('Volume')).toBeNull();
  });
});

describe('TrackPoolRow — clicking a chip', () => {
  const r = () => rule([{ enterSec: 0, exitSec: 60, fadeInSec: 0, fadeOutSec: 0 }]);

  it('is inert with no onPick — a chip stays a hint, not a control', () => {
    render(<TrackPoolRow category="MELODY" candidates={[r()]} picked={new Set()} />);
    expect(screen.queryByRole('button', { name: 'Water·I' })).toBeNull();
    expect(screen.getByText('Water·I').className).toContain('cursor-help');
  });

  it('is a button when it can be picked', async () => {
    const onPick = vi.fn();
    const candidate = r();
    render(<TrackPoolRow category="MELODY" candidates={[candidate]} picked={new Set()} onPick={onPick} />);

    const chip = screen.getByRole('button', { name: 'Water·I' });
    expect(chip.className).toContain('cursor-pointer');
    await userEvent.click(chip);

    expect(onPick).toHaveBeenCalledWith(candidate);
  });

  it('rings a pinned chip, so yours is not confused with the generator’s', () => {
    const drawn = rule([{ enterSec: 0, exitSec: 60, fadeInSec: 0, fadeOutSec: 0 }], 'INTRODUCTION');
    const mine = rule([{ enterSec: 1200, exitSec: 1800, fadeInSec: 0, fadeOutSec: 0 }], 'RETURN');
    const plain = rule([{ enterSec: 600, exitSec: 1200, fadeInSec: 0, fadeOutSec: 0 }], 'DEEP_RELAXATION');
    render(
      <TrackPoolRow
        category="MELODY"
        candidates={[drawn, plain, mine]}
        picked={new Set([drawn, mine])}
        pins={{ [slotKey(mine)]: ruleKey(mine) }}
        onPick={() => {}}
      />,
    );
    const cls = (text: string) => screen.getByRole('button', { name: text }).className;
    expect(cls('Water·I')).toContain('bg-[var(--accent-ink)]');   // drawn: filled
    expect(cls('Water·I')).not.toContain('ring-2');
    expect(cls('Water·Rt')).toContain('ring-2');                  // pinned: filled + ring
    expect(cls('Water·Rx')).not.toContain('bg-[var(--accent-ink)]'); // neither: outline
  });

  it('marks the pinned chip pressed, so the state is not colour-only', () => {
    const mine = r();
    render(
      <TrackPoolRow
        category="MELODY"
        candidates={[mine]}
        picked={new Set()}
        pins={{ [slotKey(mine)]: ruleKey(mine) }}
        onPick={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: 'Water·I' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('names the category it is the pool for, and is addressable by it', () => {
    // The testid is how RemixView's tests scope a chip query to one row — `Fire·I` appears in every
    // row FIRE authored, so an unscoped getByRole would match several buttons and throw.
    render(<TrackPoolRow category="MELODY" candidates={[r()]} picked={new Set()} />);
    const row = screen.getByTestId('pool-MELODY');
    expect(row).toHaveTextContent('MELODY');
    expect(within(row).getByText('Water·I')).toBeInTheDocument();
  });
});

describe('TrackPoolRow — a timing that can never sound', () => {
  const r = () => rule([{ enterSec: 0, exitSec: 60, fadeInSec: 0, fadeOutSec: 0 }]);

  it('strikes it through and refuses the click, rather than ringing and doing nothing', async () => {
    const onPick = vi.fn();
    render(
      <TrackPoolRow
        category="ELEMENT_SUB"
        candidates={[r()]}
        picked={new Set()}
        onPick={onPick}
        canSound={() => false}
      />,
    );

    const chip = screen.getByText('Water·I');
    expect(chip.tagName).toBe('SPAN'); // not a button — a click here could only disappoint
    expect(chip.className).toContain('line-through');
    await userEvent.click(chip);
    expect(onPick).not.toHaveBeenCalled();
  });

  it('says why, and points at the mode that can rescue it', () => {
    render(
      <TrackPoolRow category="ELEMENT_SUB" candidates={[r()]} picked={new Set()} canSound={() => false} />,
    );
    const title = screen.getByText('Water·I').getAttribute('title')!;
    expect(title).toContain('WATER ships no ELEMENT_SUB sample');
    expect(title).toContain('Borrowed timings');
  });

  it('leaves every chip playable when no canSound is given', () => {
    render(<TrackPoolRow category="MELODY" candidates={[r()]} picked={new Set()} onPick={() => {}} />);
    expect(screen.getByRole('button', { name: 'Water·I' })).toBeInTheDocument();
  });
});
