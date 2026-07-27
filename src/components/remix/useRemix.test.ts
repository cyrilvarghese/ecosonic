import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { arrangementStore } from '@/arrange/arrangementStore';
import { useRemix } from './useRemix';

const store = {
  WATER: [{
    id: 'w', element: 'WATER', label: 'w', rules: [{
      category: 'MELODY', section: 'INTRODUCTION',
      phrases: [{ enterSec: 0, exitSec: 60, fadeInSec: 0, fadeOutSec: 0 }],
      source: { element: 'WATER', sessionId: 'w', track: 'MELODY' },
    }],
  }],
  EARTH: [], AIR: [], FIRE: [], ETHER: [],
};

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => ({ store, warnings: [] }) })));
  arrangementStore.setState({
    tracks: [{ id: 'm', category: 'MELODY', label: 'm', sample: { name: 'm', path: 'm.wav', bytes: 1 }, ceilingDb: 0, locked: false }],
  });
});

describe('useRemix', () => {
  it('derives picks for present tracks; regenerate reshuffles', async () => {
    const { result } = renderHook(() => useRemix());
    await waitFor(() => expect(result.current.picks.length).toBe(1));
    expect(result.current.picks[0].trackId).toBe('m');
    act(() => result.current.regenerate());
    expect(result.current.picks.length).toBe(1);
  });
});
