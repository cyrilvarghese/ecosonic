import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import type { ArrTrack } from '@/arrange/types';
import { arrangementStore } from '@/arrange/arrangementStore';

// Record every setTracks call so we can assert the engine follows the store.
const { calls } = vi.hoisted(() => ({ calls: [] as { path: string }[][] }));
vi.mock('@/audio/AudioEngine', () => ({
  AudioEngine: class {
    setTracks = vi.fn(async (specs: { path: string }[]) => { calls.push(specs); });
    setMasterVolume = vi.fn();
    getLayerDuration = vi.fn(() => 60);
    resumeContext = vi.fn();
    suspendContext = vi.fn();
    setTrackVolume = vi.fn();
    setTrackEnvelope = vi.fn();
    triggerTrack = vi.fn();
    releaseTrack = vi.fn();
    clear = vi.fn();
  },
}));

// vi.mock is hoisted above imports, so this static import already gets the mocked AudioEngine.
import { useLayer2Engine } from './useLayer2Engine';

const track = (id: string, path: string): ArrTrack => ({
  id, category: 'MELODY', label: id, sample: { name: id, path, bytes: 1 }, ceilingDb: 0, locked: false,
});

beforeEach(() => {
  calls.length = 0;
  arrangementStore.setState({ tracks: [], masterDb: 0 });
});

describe('useLayer2Engine', () => {
  it('loads tracks that arrive after mount', async () => {
    renderHook(() => useLayer2Engine());
    act(() => { arrangementStore.setState({ tracks: [track('MELODY', 'a.wav')] }); });

    await waitFor(() => expect(calls.at(-1)).toHaveLength(1));
    expect(calls.at(-1)![0].path).toBe('a.wav');
  });

  it('reloads when the draw swaps a track sample', async () => {
    renderHook(() => useLayer2Engine());
    act(() => { arrangementStore.setState({ tracks: [track('MELODY', 'a.wav')] }); });
    await waitFor(() => expect(calls.at(-1)![0].path).toBe('a.wav'));

    act(() => { arrangementStore.setState({ tracks: [track('MELODY', 'b.wav')] }); });
    await waitFor(() => expect(calls.at(-1)![0].path).toBe('b.wav'));
  });

  it('does not reload when an unrelated part of the store changes', async () => {
    renderHook(() => useLayer2Engine());
    act(() => { arrangementStore.setState({ tracks: [track('MELODY', 'a.wav')] }); });
    await waitFor(() => expect(calls.at(-1)![0].path).toBe('a.wav'));
    const loads = calls.length;

    act(() => { arrangementStore.setState({ positionSec: 42 }); });

    expect(calls).toHaveLength(loads);
  });
});
