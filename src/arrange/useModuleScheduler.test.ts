import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { AudioEngine } from '@/audio/AudioEngine';
import type { ArrTrack, TemplateRegion } from '@/arrange/types';
import { arrangementStore } from '@/arrange/arrangementStore';
import { useModuleScheduler } from './useModuleScheduler';

const engine = {
  setTrackEnvelope: vi.fn(),
  triggerTrack: vi.fn(),
  releaseTrack: vi.fn(),
} as unknown as AudioEngine;

const track: ArrTrack = {
  id: 'NOISE', category: 'NOISE', label: 'NOISE',
  sample: { name: 'n', path: 'n.wav', bytes: 1 }, ceilingDb: 0, locked: false,
};

// A real full-session NOISE bed: one rule per section, with a gap where Return starts late.
const REGIONS: TemplateRegion[] = [
  { trackId: 'NOISE', enterSec: 0, exitSec: 600, fadeInSec: 0, fadeOutSec: 0 },
  { trackId: 'NOISE', enterSec: 600, exitSec: 1170, fadeInSec: 0, fadeOutSec: 0 },
  { trackId: 'NOISE', enterSec: 1200, exitSec: 1800, fadeInSec: 0, fadeOutSec: 0 },
];

/** Hold `scrubbing` so the loop reads our position instead of advancing its own clock. */
const at = async (sec: number) => {
  act(() => { arrangementStore.setState({ positionSec: sec }); });
  await act(async () => { await new Promise((r) => setTimeout(r, 60)); });
};

beforeEach(() => {
  vi.clearAllMocks();
  arrangementStore.setState({
    tracks: [track],
    moduleRegions: REGIONS,
    durationSec: 1800,
    positionSec: 0,
    playing: true,
    scrubbing: true,
    live: false,
    session: null,
  });
});

describe('useModuleScheduler across a full session', () => {
  it('starts the track inside the first section', async () => {
    renderHook(() => useModuleScheduler(engine));
    await at(100);
    await waitFor(() => expect(engine.triggerTrack).toHaveBeenCalledWith('NOISE', 100));
  });

  it('keeps sounding through the second section without a re-trigger', async () => {
    renderHook(() => useModuleScheduler(engine));
    await at(100);
    await waitFor(() => expect(engine.triggerTrack).toHaveBeenCalled());
    vi.clearAllMocks();

    await at(700); // inside region 2, contiguous with region 1

    // Contiguous regions hand over without stopping the sample — it just keeps looping.
    expect(engine.releaseTrack).not.toHaveBeenCalled();
  });

  it('releases in the gap between the second and third sections', async () => {
    renderHook(() => useModuleScheduler(engine));
    await at(700);
    await waitFor(() => expect(engine.triggerTrack).toHaveBeenCalled());
    vi.clearAllMocks();

    await at(1185); // 1170..1200 is silence

    await waitFor(() => expect(engine.releaseTrack).toHaveBeenCalledWith('NOISE'));
  });

  it('starts the third section after that gap', async () => {
    renderHook(() => useModuleScheduler(engine));
    await at(700);
    await at(1185);
    await waitFor(() => expect(engine.releaseTrack).toHaveBeenCalled());
    vi.clearAllMocks();

    await at(1300);

    await waitFor(() => expect(engine.triggerTrack).toHaveBeenCalledWith('NOISE', 100));
  });

  it('drives the envelope from the region under the playhead, not the first one', async () => {
    renderHook(() => useModuleScheduler(engine));
    await at(1300);
    await waitFor(() => expect(engine.setTrackEnvelope).toHaveBeenCalled());
    // Region 3 has no fades, so a point well inside it is full level.
    const calls = (engine.setTrackEnvelope as unknown as { mock: { calls: [string, number][] } }).mock.calls;
    expect(calls.at(-1)?.[1]).toBe(1);
  });
});
