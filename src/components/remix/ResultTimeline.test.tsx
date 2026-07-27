import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
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

describe('ResultTimeline playhead', () => {
  it('shows no playhead when there is no position', () => {
    render(<ResultTimeline totalSec={1800} tracks={lane} regions={[]} />);
    expect(screen.queryAllByTestId('playhead')).toHaveLength(0);
  });

  it('places a playhead in each lane at its fraction of the timeline', () => {
    render(<ResultTimeline totalSec={1800} tracks={lane} regions={[]} positionSec={450} />);
    const heads = screen.getAllByTestId('playhead');
    expect(heads).toHaveLength(lane.length);
    expect(heads[0].style.left).toBe('25%');
  });

  it('keeps the playhead on the timeline when the position overruns', () => {
    render(<ResultTimeline totalSec={600} tracks={lane} regions={[]} positionSec={9999} />);
    expect(screen.getAllByTestId('playhead')[0].style.left).toBe('100%');
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
