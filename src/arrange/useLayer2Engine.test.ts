import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import type { ArrTrack } from '@/arrange/types';
import { arrangementStore } from '@/arrange/arrangementStore';

// Record every setTracks call so we can assert the engine follows the store — and every level
// change, which must reach the graph WITHOUT a setTracks call.
const { calls, volumes, cleared } = vi.hoisted(() => ({
  cleared: { count: 0 },
  calls: [] as { path: string; volumeDb: number }[][],
  volumes: [] as { id: string; db: number }[],
}));
vi.mock('@/audio/AudioEngine', () => ({
  AudioEngine: class {
    setTracks = vi.fn(async (specs: { path: string; volumeDb: number }[]) => { calls.push(specs); });
    setMasterVolume = vi.fn();
    getLoadError = vi.fn(() => undefined);
    getLayerDuration = vi.fn(() => 60);
    resumeContext = vi.fn();
    suspendContext = vi.fn();
    setTrackVolume = vi.fn((id: string, db: number) => { volumes.push({ id, db }); });
    setTrackSend = vi.fn();
    setTrackEnvelope = vi.fn();
    setMute = vi.fn();
    triggerTrack = vi.fn();
    releaseTrack = vi.fn();
    clear = vi.fn(() => { cleared.count += 1; });
  },
}));

// vi.mock is hoisted above imports, so this static import already gets the mocked AudioEngine.
import { useLayer2Engine } from './useLayer2Engine';

const track = (id: string, path: string): ArrTrack => ({
  id, category: 'MELODY', label: id, sample: { name: id, path, bytes: 1 }, ceilingDb: 0, locked: false,
});

beforeEach(() => {
  calls.length = 0;
  volumes.length = 0;
  cleared.count = 0;
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

  it('ramps a level change into the running graph rather than reloading the sample', async () => {
    renderHook(() => useLayer2Engine());
    act(() => { arrangementStore.setState({ tracks: [track('MELODY', 'a.wav')] }); });
    await waitFor(() => expect(calls.at(-1)![0].path).toBe('a.wav'));
    const loads = calls.length;

    act(() => { arrangementStore.getState().setTrackCeilingDb('MELODY', -9); });

    // This is why the level rides the subscription and not the track key: it reaches the layer
    // that is already playing, without re-fetching and re-decoding a single sample.
    expect(volumes.at(-1)).toEqual({ id: 'MELODY', db: -9 });
    expect(calls).toHaveLength(loads);
  });

  it('hands a level set before load straight to the layer it builds', async () => {
    renderHook(() => useLayer2Engine());

    // A level restored after a redraw lands before the engine reloads, so it has to arrive in the
    // spec — not merely as a later diff against a layer that started at the wrong gain.
    act(() => { arrangementStore.setState({ tracks: [{ ...track('MELODY', 'a.wav'), ceilingDb: -6 }] }); });

    await waitFor(() => expect(calls.at(-1)).toHaveLength(1));
    expect(calls.at(-1)![0].volumeDb).toBe(-6);
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

describe('useLayer2Engine — the engine survives a redraw', () => {
  it('does not tear down when the track list changes', async () => {
    renderHook(() => useLayer2Engine());
    act(() => { arrangementStore.setState({ tracks: [track('A', 'a.wav')] }); });
    await waitFor(() => expect(calls.at(-1)).toHaveLength(1));

    // A pool edit adds a lane. Everything already loaded must stay loaded — tearing the engine down
    // here is what made a chip click refetch and re-decode every sample.
    act(() => {
      arrangementStore.setState({ tracks: [track('A', 'a.wav'), track('B', 'b.wav')] });
    });
    await waitFor(() => expect(calls.at(-1)).toHaveLength(2));

    expect(cleared.count).toBe(0);
    // …and setTracks still gets told about both, so it can reuse A and load only B.
    expect(calls.at(-1)!.map((c) => c.path)).toEqual(['a.wav', 'b.wav']);
  });

  it('tears down on unmount, where it belongs', async () => {
    const { unmount } = renderHook(() => useLayer2Engine());
    act(() => { arrangementStore.setState({ tracks: [track('A', 'a.wav')] }); });
    await waitFor(() => expect(calls.at(-1)).toHaveLength(1));
    expect(cleared.count).toBe(0);

    unmount();

    expect(cleared.count).toBe(1);
  });
});
