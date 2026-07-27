import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ResultTimeline, tickStep } from './ResultTimeline';

const lane = [{
  id: 't', category: 'MELODY' as const, label: 'MELODY',
  sample: { name: '', path: '', bytes: 0 }, ceilingDb: 0, locked: false,
}];

describe('ResultTimeline', () => {
  it('positions a region bar by absolute time over totalSec', () => {
    render(
      <ResultTimeline
        totalSec={1800}
        tracks={[{ id: 't', category: 'MELODY', label: 'MELODY', sample: { name: '', path: '', bytes: 0 }, ceilingDb: 0, locked: false }]}
        regions={[{ trackId: 't', enterSec: 900, exitSec: 1800, fadeInSec: 0, fadeOutSec: 0 }]}
      />,
    );
    const bar = screen.getByTestId('region-t-900');
    expect(bar.style.left).toBe('50%');
    expect(bar.style.width).toBe('50%');
  });
});

describe('tickStep', () => {
  it('picks a 5-minute step for a 30-minute session', () => {
    expect(tickStep(1800)).toBe(300);
  });
  it('picks a 2-minute step for a 10-minute module', () => {
    expect(tickStep(600)).toBe(120);
  });
  it('never yields more than eight labels', () => {
    for (const total of [300, 600, 900, 1800, 3600]) {
      expect(Math.floor(total / tickStep(total)) + 1).toBeLessThanOrEqual(8);
    }
  });
});

describe('ResultTimeline element colour', () => {
  it('tags each region with its track element so it takes that element colour', () => {
    render(
      <ResultTimeline
        totalSec={1800}
        tracks={lane}
        regions={[{ trackId: 't', enterSec: 0, exitSec: 600, fadeInSec: 0, fadeOutSec: 0 }]}
        trackElements={{ t: 'FIRE' }}
      />,
    );
    expect(screen.getByTestId('region-t-0')).toHaveAttribute('data-element', 'fire');
  });

  it('leaves a region untagged when its track element is unknown', () => {
    render(
      <ResultTimeline
        totalSec={1800}
        tracks={lane}
        regions={[{ trackId: 't', enterSec: 0, exitSec: 600, fadeInSec: 0, fadeOutSec: 0 }]}
      />,
    );
    expect(screen.getByTestId('region-t-0')).not.toHaveAttribute('data-element');
  });
});

describe('ResultTimeline playhead', () => {
  const twoLanes = [
    lane[0],
    { ...lane[0], id: 'u', label: 'PAD' },
  ];

  it('draws one playhead across every lane, not one per lane', () => {
    render(<ResultTimeline totalSec={1800} tracks={twoLanes} regions={[]} positionSec={450} />);
    const heads = screen.getAllByTestId('playhead');
    expect(heads).toHaveLength(1);
    expect(heads[0].style.left).toBe('25%');
  });

  it('sits at the start when nothing has played yet, so it can be dragged', () => {
    render(<ResultTimeline totalSec={1800} tracks={lane} regions={[]} />);
    expect(screen.getByTestId('playhead').style.left).toBe('0%');
  });

  it('keeps the playhead on the timeline when the position overruns', () => {
    render(<ResultTimeline totalSec={600} tracks={lane} regions={[]} positionSec={9999} />);
    expect(screen.getByTestId('playhead').style.left).toBe('100%');
  });

  it('seeks to the point pressed on the scrub strip', () => {
    const onScrub = vi.fn();
    render(
      <ResultTimeline totalSec={1800} tracks={lane} regions={[]} positionSec={0}
        onScrub={onScrub} onScrubStart={vi.fn()} onScrubEnd={vi.fn()} />,
    );
    const strip = screen.getByTestId('scrub-strip');
    strip.getBoundingClientRect = () => ({ left: 100, width: 400, right: 500, top: 0, bottom: 0, height: 0, x: 100, y: 0, toJSON: () => ({}) });
    strip.setPointerCapture = vi.fn();

    fireEvent.pointerDown(strip, { clientX: 200, pointerId: 1 });

    expect(onScrub).toHaveBeenCalledWith(450); // (200-100)/400 = 0.25 of 1800
  });

  it('clamps a drag that leaves the strip', () => {
    const onScrub = vi.fn();
    render(
      <ResultTimeline totalSec={600} tracks={lane} regions={[]} positionSec={0}
        onScrub={onScrub} onScrubStart={vi.fn()} onScrubEnd={vi.fn()} />,
    );
    const strip = screen.getByTestId('scrub-strip');
    strip.getBoundingClientRect = () => ({ left: 100, width: 400, right: 500, top: 0, bottom: 0, height: 0, x: 100, y: 0, toJSON: () => ({}) });
    strip.setPointerCapture = vi.fn();

    fireEvent.pointerDown(strip, { clientX: 9999, pointerId: 1 });

    expect(onScrub).toHaveBeenCalledWith(600);
  });
});

describe('ResultTimeline scale', () => {
  it('labels a 30-minute session every 5 minutes', () => {
    render(<ResultTimeline totalSec={1800} tracks={lane} regions={[]} />);
    for (const label of ['0:00', '5:00', '10:00', '15:00', '20:00', '25:00', '30:00']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('positions a tick at its fraction of the timeline', () => {
    render(<ResultTimeline totalSec={1800} tracks={lane} regions={[]} />);
    expect(screen.getByTestId('tick-900').style.left).toBe('50%');
  });

  it('rescales for a 10-minute section module', () => {
    render(<ResultTimeline totalSec={600} tracks={lane} regions={[]} />);
    expect(screen.getByText('10:00')).toBeInTheDocument();
    expect(screen.queryByText('30:00')).toBeNull();
  });
});
