import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ArrTrack } from '@/arrange/types';
import type { AuthoredRule } from '@/remix/sessionRules';
import { TrackPoolRow } from './TrackPoolRow';

const track: ArrTrack = {
  id: 'MELODY', category: 'MELODY', label: 'MELODY',
  sample: { name: 'm', path: 'm.wav', bytes: 1 }, ceilingDb: 0, locked: false,
};

const SENDS = { reverb: 0, delay: 0 };
const noop = () => {};

const rule = (
  phrases: AuthoredRule['phrases'],
  section: AuthoredRule['section'] = 'INTRODUCTION',
  sessionId = 'water-session-layer-timeline',
): AuthoredRule => ({
  category: 'MELODY', section, sectionStartSec: 0, phrases,
  source: { element: 'WATER', sessionId, track: 'MELODY' },
});

describe('TrackPoolRow', () => {
  it('names the element, section and interval on hover', () => {
    const r = rule([{ enterSec: 60, exitSec: 540, fadeInSec: 0, fadeOutSec: 0 }]);
    render(<TrackPoolRow track={track} candidates={[r]} picked={new Set()} sends={SENDS} onSend={noop} />);
    expect(screen.getByText('Water·I'))
      .toHaveAttribute('title', 'WATER · water-session-layer-timeline · Introduction · 1:00–9:00');
  });

  it('lists every phrase of a multi-phrase rule', () => {
    const r = rule([
      { enterSec: 165, exitSec: 273, fadeInSec: 0, fadeOutSec: 0 },
      { enterSec: 327, exitSec: 435, fadeInSec: 0, fadeOutSec: 0 },
    ]);
    render(<TrackPoolRow track={track} candidates={[r]} picked={new Set()} sends={SENDS} onSend={noop} />);
    expect(screen.getByText('Water·I'))
      .toHaveAttribute('title',
        'WATER · water-session-layer-timeline · Introduction · 2:45–4:33, 5:27–7:15');
  });

  it('lights every rule the draw picked, not just one', () => {
    const intro = rule([{ enterSec: 0, exitSec: 600, fadeInSec: 0, fadeOutSec: 0 }], 'INTRODUCTION');
    const ret = rule([{ enterSec: 1200, exitSec: 1800, fadeInSec: 0, fadeOutSec: 0 }], 'RETURN');
    const unpicked = rule([{ enterSec: 600, exitSec: 1200, fadeInSec: 0, fadeOutSec: 0 }], 'DEEP_RELAXATION');
    render(
      <TrackPoolRow track={track} candidates={[intro, unpicked, ret]} picked={new Set([intro, ret])} sends={SENDS} onSend={noop} />,
    );
    const lit = (text: string) => screen.getByText(text).className.includes('bg-[var(--accent-ink)]');
    expect(lit('Water·I')).toBe(true);
    expect(lit('Water·Rt')).toBe(true);
    expect(lit('Water·Rx')).toBe(false);
  });

  it('spells out the section a chip abbreviates', () => {
    const r = rule([{ enterSec: 1200, exitSec: 1500, fadeInSec: 0, fadeOutSec: 0 }], 'DEEP_RELAXATION');
    render(<TrackPoolRow track={track} candidates={[r]} picked={new Set()} sends={SENDS} onSend={noop} />);
    expect(screen.getByText('Water·Rx'))
      .toHaveAttribute('title',
        'WATER · water-session-layer-timeline · Deep Relaxation · 20:00–25:00');
  });

  it('names the session, so two sessions of one element can be told apart', () => {
    const ocean = rule([{ enterSec: 0, exitSec: 60, fadeInSec: 0, fadeOutSec: 0 }], 'INTRODUCTION', 'water-ocean');
    render(<TrackPoolRow track={track} candidates={[ocean]} picked={new Set()} sends={SENDS} onSend={noop} />);
    expect(screen.getByText('Water·I')).toHaveAttribute('title', expect.stringContaining('water-ocean'));
  });

  it('leaves the session off when it adds nothing beyond the element', () => {
    const r = rule([{ enterSec: 0, exitSec: 60, fadeInSec: 0, fadeOutSec: 0 }], 'INTRODUCTION', 'WATER');
    render(<TrackPoolRow track={track} candidates={[r]} picked={new Set()} sends={SENDS} onSend={noop} />);
    expect(screen.getByText('Water·I')).toHaveAttribute('title', 'WATER · Introduction · 0:00–1:00');
  });

  it('tags each chip with its element so it takes that element colour', () => {
    const r = rule([{ enterSec: 0, exitSec: 60, fadeInSec: 0, fadeOutSec: 0 }]);
    render(<TrackPoolRow track={track} candidates={[r]} picked={new Set()} sends={SENDS} onSend={noop} />);
    expect(screen.getByText('Water·I')).toHaveAttribute('data-element', 'water');
  });

  it('renders a slider for each send, at the current value', () => {
    render(
      <TrackPoolRow
        track={track} candidates={[]} picked={new Set()}
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
        track={track} candidates={[]} picked={new Set()}
        sends={{ reverb: 0, delay: 0 }} onSend={onSend}
      />,
    );
    fireEvent.change(screen.getByLabelText('Reverb send'), { target: { value: '0.5' } });
    expect(onSend).toHaveBeenCalledWith('reverb', 0.5);
  });
});
