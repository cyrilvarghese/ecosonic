import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ResultTimeline } from './ResultTimeline';

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
