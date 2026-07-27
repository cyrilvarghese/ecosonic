import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

describe('ResultTimeline interval labels', () => {
  const bar600 = [{ trackId: 't', enterSec: 300, exitSec: 900, fadeInSec: 0, fadeOutSec: 0 }];

  it('names the source material on the left and the interval length on the right', () => {
    // 3:30 sample under a 10:00 interval → it plays 3 times over.
    render(<ResultTimeline totalSec={1800} tracks={lane} regions={bar600} trackDurations={{ t: 210 }} />);
    const bar = screen.getByTestId('region-t-300');
    expect(within(bar).getByTestId('interval-source')).toHaveTextContent('MELODY 3:30 ×3');
    expect(within(bar).getByTestId('interval-length')).toHaveTextContent('10:00');
  });

  it('never multiplies the interval length by the loop count', () => {
    render(<ResultTimeline totalSec={1800} tracks={lane} regions={bar600} trackDurations={{ t: 210 }} />);
    // "10:00 ×3" would read as thirty minutes of audio; the ×N belongs to the sample.
    expect(within(screen.getByTestId('region-t-300')).getByTestId('interval-source'))
      .not.toHaveTextContent('10:00');
  });

  it('spells the whole thing out on hover, for bars too narrow to read', () => {
    render(<ResultTimeline totalSec={1800} tracks={lane} regions={bar600} trackDurations={{ t: 210 }} />);
    expect(screen.getByTestId('region-t-300'))
      .toHaveAttribute('title', 'MELODY · 5:00–15:00 · sample 3:30 ×3 · interval 10:00');
  });

  it('shows only the interval until the sample length is known', () => {
    render(<ResultTimeline totalSec={1800} tracks={lane} regions={bar600} />);
    const bar = screen.getByTestId('region-t-300');
    expect(within(bar).getByTestId('interval-source')).toHaveTextContent('MELODY');
    expect(within(bar).getByTestId('interval-length')).toHaveTextContent('10:00');
    expect(bar).toHaveAttribute('title', 'MELODY · 5:00–15:00 · interval 10:00');
  });
});

describe('ResultTimeline loop length', () => {
  const tenMinBar = [{ trackId: 't', enterSec: 0, exitSec: 600, fadeInSec: 0, fadeOutSec: 0 }];

  it('reports how many times a short sample repeats to fill the interval', () => {
    // 1:56 sample under a 10:00 interval → ceil(600/116) = 6 repeats, the last one partial.
    render(<ResultTimeline totalSec={1800} tracks={lane} regions={tenMinBar} trackDurations={{ t: 116 }} />);
    const bar = screen.getByTestId('region-t-0');
    expect(within(bar).getByTestId('interval-source')).toHaveTextContent('MELODY 1:56 ×6');
    expect(bar).toHaveAttribute('title', 'MELODY · 0:00–10:00 · sample 1:56 ×6 · interval 10:00');
  });

  it('draws one segment per repeat so the loop points are visible', () => {
    render(<ResultTimeline totalSec={1800} tracks={lane} regions={tenMinBar} trackDurations={{ t: 116 }} />);
    expect(within(screen.getByTestId('region-t-0')).getAllByTestId('loop-seg')).toHaveLength(6);
  });

  it('says how much of the sample is heard when the interval is shorter than it', () => {
    const shortBar = [{ trackId: 't', enterSec: 0, exitSec: 60, fadeInSec: 0, fadeOutSec: 0 }];
    render(<ResultTimeline totalSec={1800} tracks={lane} regions={shortBar} trackDurations={{ t: 116 }} />);
    expect(screen.getByTestId('region-t-0'))
      .toHaveAttribute('title', 'MELODY · 0:00–1:00 · sample 1:56, 1:00 heard · interval 1:00');
  });

  it('does not segment when the sample fills the interval once', () => {
    render(<ResultTimeline totalSec={1800} tracks={lane} regions={tenMinBar} trackDurations={{ t: 600 }} />);
    const bar = screen.getByTestId('region-t-0');
    expect(within(bar).getByTestId('interval-source')).not.toHaveTextContent('×');
    expect(within(bar).queryAllByTestId('loop-seg')).toHaveLength(0);
  });

  it('stops drawing segments when a sample is so short it would be a picket fence', () => {
    // 5s under 10:00 = 120 repeats; the ×N readout still carries the count.
    render(<ResultTimeline totalSec={1800} tracks={lane} regions={tenMinBar} trackDurations={{ t: 5 }} />);
    const bar = screen.getByTestId('region-t-0');
    expect(within(bar).getByTestId('interval-source')).toHaveTextContent('0:05 ×120');
    expect(within(bar).queryAllByTestId('loop-seg')).toHaveLength(0);
  });
});

describe('ResultTimeline mute', () => {
  it('offers a mute toggle per lane', async () => {
    const onToggleMute = vi.fn();
    render(<ResultTimeline totalSec={1800} tracks={lane} regions={[]} onToggleMute={onToggleMute} />);

    await userEvent.click(screen.getByRole('button', { name: 'Mute MELODY' }));

    expect(onToggleMute).toHaveBeenCalledWith('t');
  });

  it('marks a muted lane as pressed and offers to unmute it', () => {
    render(
      <ResultTimeline totalSec={1800} tracks={lane} regions={[]}
        onToggleMute={vi.fn()} mutedIds={new Set(['t'])} />,
    );
    expect(screen.getByRole('button', { name: 'Unmute MELODY' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows no mute control when the timeline is not interactive', () => {
    render(<ResultTimeline totalSec={1800} tracks={lane} regions={[]} />);
    expect(screen.queryByRole('button', { name: /Mute/ })).toBeNull();
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
