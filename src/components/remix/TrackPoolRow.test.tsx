import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ArrTrack } from '@/arrange/types';
import type { AuthoredRule } from '@/remix/sessionRules';
import { TrackPoolRow } from './TrackPoolRow';

const track: ArrTrack = {
  id: 'MELODY', category: 'MELODY', label: 'MELODY',
  sample: { name: 'm', path: 'm.wav', bytes: 1 }, ceilingDb: 0, locked: false,
};

const rule = (
  phrases: AuthoredRule['phrases'],
  section: AuthoredRule['section'] = 'INTRODUCTION',
): AuthoredRule => ({
  category: 'MELODY', section, sectionStartSec: 0, phrases,
  source: { element: 'WATER', sessionId: 'w', track: 'MELODY' },
});

describe('TrackPoolRow', () => {
  it('names the element, section and interval on hover', () => {
    const r = rule([{ enterSec: 60, exitSec: 540, fadeInSec: 0, fadeOutSec: 0 }]);
    render(<TrackPoolRow track={track} candidates={[r]} picked={new Set()} />);
    expect(screen.getByText('Water·I')).toHaveAttribute('title', 'WATER · Introduction · 1:00–9:00');
  });

  it('lists every phrase of a multi-phrase rule', () => {
    const r = rule([
      { enterSec: 165, exitSec: 273, fadeInSec: 0, fadeOutSec: 0 },
      { enterSec: 327, exitSec: 435, fadeInSec: 0, fadeOutSec: 0 },
    ]);
    render(<TrackPoolRow track={track} candidates={[r]} picked={new Set()} />);
    expect(screen.getByText('Water·I'))
      .toHaveAttribute('title', 'WATER · Introduction · 2:45–4:33, 5:27–7:15');
  });

  it('lights every rule the draw picked, not just one', () => {
    const intro = rule([{ enterSec: 0, exitSec: 600, fadeInSec: 0, fadeOutSec: 0 }], 'INTRODUCTION');
    const ret = rule([{ enterSec: 1200, exitSec: 1800, fadeInSec: 0, fadeOutSec: 0 }], 'RETURN');
    const unpicked = rule([{ enterSec: 600, exitSec: 1200, fadeInSec: 0, fadeOutSec: 0 }], 'DEEP_RELAXATION');
    render(
      <TrackPoolRow track={track} candidates={[intro, unpicked, ret]} picked={new Set([intro, ret])} />,
    );
    const lit = (text: string) => screen.getByText(text).className.includes('bg-[var(--accent-ink)]');
    expect(lit('Water·I')).toBe(true);
    expect(lit('Water·Rt')).toBe(true);
    expect(lit('Water·Rx')).toBe(false);
  });

  it('spells out the section a chip abbreviates', () => {
    const r = rule([{ enterSec: 1200, exitSec: 1500, fadeInSec: 0, fadeOutSec: 0 }], 'DEEP_RELAXATION');
    render(<TrackPoolRow track={track} candidates={[r]} picked={new Set()} />);
    expect(screen.getByText('Water·Rx'))
      .toHaveAttribute('title', 'WATER · Deep Relaxation · 20:00–25:00');
  });

  it('tags each chip with its element so it takes that element colour', () => {
    const r = rule([{ enterSec: 0, exitSec: 60, fadeInSec: 0, fadeOutSec: 0 }]);
    render(<TrackPoolRow track={track} candidates={[r]} picked={new Set()} />);
    expect(screen.getByText('Water·I')).toHaveAttribute('data-element', 'water');
  });
});
