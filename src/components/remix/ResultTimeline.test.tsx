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
    // 2:00 sample under a 10:00 interval → exactly 5 passes.
    render(<ResultTimeline totalSec={1800} tracks={lane} regions={bar600} trackDurations={{ t: 120 }} />);
    const bar = screen.getByTestId('region-t-300');
    expect(within(bar).getByTestId('interval-source')).toHaveTextContent('MELODY 2:00 ×5');
    expect(within(bar).getByTestId('interval-length')).toHaveTextContent('10:00');
  });

  it('never multiplies the interval length by the loop count', () => {
    render(<ResultTimeline totalSec={1800} tracks={lane} regions={bar600} trackDurations={{ t: 120 }} />);
    // "10:00 ×5" would read as fifty minutes of audio; the ×N belongs to the sample.
    expect(within(screen.getByTestId('region-t-300')).getByTestId('interval-source'))
      .not.toHaveTextContent('10:00');
  });

  it('spells the whole thing out on hover, for bars too narrow to read', () => {
    render(<ResultTimeline totalSec={1800} tracks={lane} regions={bar600} trackDurations={{ t: 120 }} />);
    expect(screen.getByTestId('region-t-300'))
      .toHaveAttribute('title', 'MELODY · 5:00–15:00 · sample 2:00 ×5 · interval 10:00');
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
  const bar = (enterSec: number, exitSec: number) =>
    [{ trackId: 't', enterSec, exitSec, fadeInSec: 0, fadeOutSec: 0 }];

  it('multiplies out exactly when the sample divides the interval', () => {
    // 5 × 1:56 = 9:40. The count is a product, so the numbers on screen must agree.
    render(<ResultTimeline totalSec={1800} tracks={lane} regions={bar(0, 580)} trackDurations={{ t: 116 }} />);
    const b = screen.getByTestId('region-t-0');
    expect(within(b).getByTestId('interval-source')).toHaveTextContent('MELODY 1:56 ×5');
    expect(within(b).getByTestId('interval-length')).toHaveTextContent('9:40');
  });

  it('shows the tenths a whole-second sample length would hide', () => {
    // 5 × 116.2 = 581 = 9:41. Printing "1:56" would read as 9:40.
    render(<ResultTimeline totalSec={1800} tracks={lane} regions={bar(0, 581)} trackDurations={{ t: 116.2 }} />);
    const b = screen.getByTestId('region-t-0');
    expect(within(b).getByTestId('interval-source')).toHaveTextContent('MELODY 1:56.2 ×5');
    expect(within(b).getByTestId('interval-length')).toHaveTextContent('9:41');
  });

  it('survives the float drift of an interval built as N × sample', () => {
    const sample = 116.2;
    render(
      <ResultTimeline totalSec={1800} tracks={lane}
        regions={bar(0, 5 * sample)} trackDurations={{ t: sample }} />,
    );
    // ceil() on 5.000000000000001 would have said ×6.
    expect(within(screen.getByTestId('region-t-0')).getByTestId('interval-source'))
      .toHaveTextContent('×5');
  });

  it('marks a count that does not multiply out rather than inventing one', () => {
    // 600 / 116 = 5.17 — no integer works, so say "5 whole passes and part of another".
    render(<ResultTimeline totalSec={1800} tracks={lane} regions={tenMinBar} trackDurations={{ t: 116 }} />);
    const b = screen.getByTestId('region-t-0');
    expect(within(b).getByTestId('interval-source')).toHaveTextContent('MELODY 1:56 ×5+');
    expect(b).toHaveAttribute('title', 'MELODY · 0:00–10:00 · sample 1:56 ×5+ · interval 10:00');
  });

  it('draws a panel per whole pass plus one for the partial', () => {
    render(<ResultTimeline totalSec={1800} tracks={lane} regions={tenMinBar} trackDurations={{ t: 116 }} />);
    expect(within(screen.getByTestId('region-t-0')).getAllByTestId('loop-seg')).toHaveLength(6);
  });

  it('draws exactly one panel per pass when it divides evenly', () => {
    render(<ResultTimeline totalSec={1800} tracks={lane} regions={bar(0, 580)} trackDurations={{ t: 116 }} />);
    expect(within(screen.getByTestId('region-t-0')).getAllByTestId('loop-seg')).toHaveLength(5);
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
    // 5s under 10:00 = 120 repeats; the count still carries the number.
    render(<ResultTimeline totalSec={1800} tracks={lane} regions={tenMinBar} trackDurations={{ t: 5 }} />);
    const b = screen.getByTestId('region-t-0');
    expect(within(b).getByTestId('interval-source')).toHaveTextContent('0:05 ×120');
    expect(within(b).queryAllByTestId('loop-seg')).toHaveLength(0);
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

describe('ResultTimeline — a lane that rotates its samples', () => {
  const rotating = (name: string) => ({
    id: `MELODY·EARTH·${name}`,
    row: { id: 'MELODY·EARTH', label: 'MELODY · Earth' },
    category: 'MELODY' as const,
    label: `MELODY · Earth · ${name}`,
    sample: { name, path: `${name}.wav`, bytes: 1 },
    ceilingDb: 0,
    locked: false,
  });

  it('renders as ONE row, not one per file', () => {
    render(
      <ResultTimeline
        totalSec={1800}
        tracks={[rotating('A'), rotating('B'), rotating('C')]}
        regions={[
          { trackId: 'MELODY·EARTH·A', enterSec: 0, exitSec: 600, fadeInSec: 0, fadeOutSec: 0 },
          { trackId: 'MELODY·EARTH·B', enterSec: 600, exitSec: 1200, fadeInSec: 0, fadeOutSec: 0 },
          { trackId: 'MELODY·EARTH·C', enterSec: 1200, exitSec: 1800, fadeInSec: 0, fadeOutSec: 0 },
        ]}
      />,
    );
    expect(screen.getAllByTestId(/^lane-/)).toHaveLength(1);
    expect(screen.getByTestId('lane-MELODY·EARTH')).toBeInTheDocument();
    // All three sections sit on that one row.
    expect(screen.getAllByTestId(/^region-MELODY·EARTH·/)).toHaveLength(3);
  });

  it('names the file each block plays, so the rotation is visible', () => {
    render(
      <ResultTimeline
        totalSec={1800}
        tracks={[rotating('OCEAN'), rotating('RAIN')]}
        regions={[
          { trackId: 'MELODY·EARTH·OCEAN', enterSec: 0, exitSec: 600, fadeInSec: 0, fadeOutSec: 0 },
          { trackId: 'MELODY·EARTH·RAIN', enterSec: 600, exitSec: 1200, fadeInSec: 0, fadeOutSec: 0 },
        ]}
      />,
    );
    const sources = screen.getAllByTestId('interval-source').map((n) => n.textContent);
    expect(sources.some((s) => s?.includes('OCEAN'))).toBe(true);
    expect(sources.some((s) => s?.includes('RAIN'))).toBe(true);
  });
});

describe('ResultTimeline — waiting on sample lengths', () => {
  const track = {
    id: 'PAD·WATER', category: 'PAD' as const, label: 'PAD · Water',
    sample: { name: 'p', path: 'p.wav', bytes: 1 }, ceilingDb: 0, locked: false,
  };
  const regions = [
    { trackId: 'PAD·WATER', enterSec: 0, exitSec: 600, fadeInSec: 0, fadeOutSec: 0 },
  ];

  it('shows a skeleton in place of the loop count while the sample loads', () => {
    render(
      <ResultTimeline
        totalSec={1800} tracks={[track]} regions={regions}
        pendingIds={new Set(['PAD·WATER'])}
      />,
    );
    const bar = screen.getByTestId('region-PAD·WATER-0');
    expect(bar).toHaveAttribute('data-pending', 'true');
    expect(screen.getByTestId('source-skeleton')).toHaveTextContent('Loading Samples');
    // The bar itself is real — only the count is unknown.
    expect(within(bar).getByTestId('interval-source')).toHaveTextContent('PAD · Water');
  });

  it('says why, rather than leaving a pulsing bar unexplained', () => {
    render(
      <ResultTimeline
        totalSec={1800} tracks={[track]} regions={regions}
        pendingIds={new Set(['PAD·WATER'])}
      />,
    );
    expect(screen.getByTestId('region-PAD·WATER-0').getAttribute('title'))
      .toMatch(/Loading Samples/);
  });

  it('settles once the length arrives', () => {
    render(
      <ResultTimeline
        totalSec={1800} tracks={[track]} regions={regions}
        trackDurations={{ 'PAD·WATER': 120 }}
        pendingIds={new Set()}
      />,
    );
    const bar = screen.getByTestId('region-PAD·WATER-0');
    expect(bar).toHaveAttribute('data-pending', 'false');
    expect(screen.queryByTestId('source-skeleton')).toBeNull();
    expect(within(bar).getByTestId('interval-source')).toHaveTextContent('×5');
  });

  it('shows no skeleton at all when the caller passes no pending set', () => {
    render(<ResultTimeline totalSec={1800} tracks={[track]} regions={regions} />);
    expect(screen.getByTestId('region-PAD·WATER-0')).toHaveAttribute('data-pending', 'false');
    expect(screen.queryByTestId('source-skeleton')).toBeNull();
  });
});

describe('ResultTimeline — the volume line', () => {
  const track = (ceilingDb: number) => ({
    id: 'PAD·WATER', category: 'PAD' as const, label: 'PAD · Water',
    sample: { name: 'p', path: 'p.wav', bytes: 1 }, ceilingDb, locked: false,
  });
  const faded = [{ trackId: 'PAD·WATER', enterSec: 0, exitSec: 600, fadeInSec: 60, fadeOutSec: 60 }];

  it('draws an envelope over every region', () => {
    render(<ResultTimeline totalSec={1800} tracks={[track(0)]} regions={faded} />);
    expect(screen.getAllByTestId('fade-envelope')).toHaveLength(1);
  });

  it('rides the track’s level, so pulling the volume down lowers the line', () => {
    const { container, rerender } = render(
      <ResultTimeline totalSec={1800} tracks={[track(0)]} regions={faded} />,
    );
    const held = () => container.querySelector('[data-testid="fade-envelope"] path')!.getAttribute('d')!;
    const atUnity = held();

    rerender(<ResultTimeline totalSec={1800} tracks={[track(-30)]} regions={faded} />);

    expect(held()).not.toBe(atUnity);
    // y grows downward in the viewBox, so a quieter track holds at a LARGER y.
    const topOf = (d: string) => Math.min(...d.match(/ (\d+\.\d)/g)!.map(Number));
    expect(topOf(held())).toBeGreaterThan(topOf(atUnity));
  });

  it('shows a square shape when a region has no fades at all', () => {
    const square = [{ trackId: 'PAD·WATER', enterSec: 0, exitSec: 600, fadeInSec: 0, fadeOutSec: 0 }];
    render(<ResultTimeline totalSec={1800} tracks={[track(0)]} regions={square} />);
    const d = screen.getByTestId('fade-envelope').querySelector('path')!.getAttribute('d')!;
    // Vertical rise at the left edge and drop at the right — a handful of points, not a curve.
    expect(d.split('L').length).toBeLessThan(6);
  });
});
