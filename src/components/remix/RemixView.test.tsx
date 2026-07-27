import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { arrangementStore } from '@/arrange/arrangementStore';
import { RemixView } from './RemixView';

// RemixView mounts the real audio engine, which builds an AudioContext jsdom does not implement.
vi.mock('@/audio/AudioEngine', () => ({
  AudioEngine: class {
    setTracks = vi.fn(async () => {});
    setMasterVolume = vi.fn();
    getLayerDuration = vi.fn(() => 60);
    resumeContext = vi.fn();
    suspendContext = vi.fn();
    setTrackVolume = vi.fn();
    setTrackEnvelope = vi.fn();
    setMute = vi.fn();
    triggerTrack = vi.fn();
    releaseTrack = vi.fn();
    clear = vi.fn();
  },
}));

// One renderer mock the tests drive — `hold` keeps a render open so progress can be observed.
const { exportCtl } = vi.hoisted(() => ({
  exportCtl: {
    fail: false,
    hold: false,
    release: null as null | (() => void),
    progress: null as null | ((frac: number) => void),
    lastArgs: null as null | { tracks: { id: string }[]; regions: { trackId: string }[] },
  },
}));
vi.mock('@/remix/renderFreeMix', () => ({
  estimatedWavBytes: (totalSec: number) => totalSec * 44100 * 4 + 44,
  exportFreeMixWav: vi.fn(async (args: {
    onProgress?: (frac: number) => void;
    tracks: { id: string }[];
    regions: { trackId: string }[];
  }) => {
    if (exportCtl.fail) throw new Error('decode failed');
    exportCtl.lastArgs = { tracks: args.tracks, regions: args.regions };
    exportCtl.progress = args.onProgress ?? null;
    if (exportCtl.hold) await new Promise<void>((r) => { exportCtl.release = r; });
    return new Blob(['fake'], { type: 'audio/wav' });
  }),
}));

const { MANIFEST } = vi.hoisted(() => {
  const CATS = ['ISO', 'PLANET', 'NOISE', 'ELEMENT', 'ELEMENT_SUB', 'BASS', 'PAD', 'DRONE', 'ARP', 'MELODY', 'FX'];
  const m: Record<string, Record<string, unknown[]>> = {};
  for (const el of ['EARTH', 'WATER', 'AIR', 'FIRE', 'ETHER']) {
    m[el] = {};
    for (const c of CATS) m[el][c] = [{ name: `${el}-${c}`, path: `${el}-${c}.wav`, bytes: 1, ext: '.wav' }];
  }
  return { MANIFEST: m };
});
vi.mock('@/manifest.json', () => ({ default: MANIFEST }));

const rule = (
  category: string,
  element: string,
  section = 'INTRODUCTION',
  sectionStartSec = 0,
  phrases = [{ enterSec: 0, exitSec: 60, fadeInSec: 0, fadeOutSec: 0 }],
) => ({
  category,
  section,
  sectionStartSec,
  phrases,
  source: { element, sessionId: `${element}-1`, track: category },
});

// WATER authored a MELODY but no PAD — so scoping to WATER visibly drops the PAD lane. BASS exists
// only in RETURN, so picking that section visibly narrows the draw to it.
const STORE = {
  EARTH: [],
  AIR: [],
  ETHER: [],
  WATER: [{ id: 'w', element: 'WATER', label: 'w', rules: [rule('MELODY', 'WATER')] }],
  FIRE: [{
    id: 'f', element: 'FIRE', label: 'f', rules: [
      rule('MELODY', 'FIRE'),
      rule('PAD', 'FIRE'),
      rule('BASS', 'FIRE', 'RETURN', 1200, [{ enterSec: 1320, exitSec: 1500, fadeInSec: 0, fadeOutSec: 0 }]),
    ],
  }],
};

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => ({ store: STORE, warnings: [] }) })));
  // jsdom implements neither of these; the download path calls both.
  vi.stubGlobal('URL', { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} });
  // ...and clicking the download anchor makes jsdom log "navigation to another Document".
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  exportCtl.fail = false;
  exportCtl.hold = false;
  exportCtl.release = null;
  exportCtl.progress = null;
  exportCtl.lastArgs = null;
  // durationMin resets too — seeding a section draw writes the module length into the shared store.
  arrangementStore.setState({ tracks: [], durationMin: 30 });
});

describe('RemixView', () => {
  it('draws a mix with no Arrangement set up', async () => {
    render(<RemixView />);
    await screen.findByTestId('region-MELODY-0');
    expect(screen.queryByText(/Set up an Arrangement first/i)).toBeNull();
  });

  it('hides the element chips until scoped mode is on', async () => {
    render(<RemixView />);
    await screen.findByTestId('region-PAD-0');
    expect(screen.getByRole('button', { name: 'Cross-element' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: 'WATER' })).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Scoped' }));

    expect(screen.getByRole('button', { name: 'Scoped' })).toHaveAttribute('aria-pressed', 'true');
    for (const el of ['EARTH', 'WATER', 'AIR', 'FIRE', 'ETHER']) {
      expect(screen.getByRole('button', { name: el })).toBeInTheDocument();
    }
  });

  it('offers the four section scopes with full session selected', async () => {
    render(<RemixView />);
    await screen.findByTestId('region-PAD-0');
    expect(screen.getByRole('button', { name: 'Full session' })).toHaveAttribute('aria-pressed', 'true');
    for (const label of ['Intro', 'Deep Relaxation', 'Return']) {
      expect(screen.getByRole('button', { name: label })).toHaveAttribute('aria-pressed', 'false');
    }
  });

  it('narrows the draw to one section module', async () => {
    render(<RemixView />);
    await screen.findByTestId('region-PAD-0');

    await userEvent.click(screen.getByRole('button', { name: 'Return' }));

    expect(screen.getByRole('button', { name: 'Return' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('region-BASS-120')).toBeInTheDocument(); // 1320 rebased by 1200
    expect(screen.queryByTestId('region-PAD-0')).toBeNull();
  });

  it('toggles the transport button between play and pause', async () => {
    render(<RemixView />);
    await screen.findByTestId('region-PAD-0');
    expect(screen.getByRole('button', { name: /Play/ })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Play/ }));
    expect(screen.getByRole('button', { name: /Pause/ })).toBeInTheDocument();
    expect(arrangementStore.getState().playing).toBe(true);

    await userEvent.click(screen.getByRole('button', { name: /Pause/ }));
    expect(screen.getByRole('button', { name: /Play/ })).toBeInTheDocument();
    expect(arrangementStore.getState().playing).toBe(false);
  });

  it('resumes from the paused position instead of restarting', async () => {
    render(<RemixView />);
    await screen.findByTestId('region-PAD-0');
    await userEvent.click(screen.getByRole('button', { name: /Play/ }));

    act(() => { arrangementStore.setState({ positionSec: 420 }); });
    await userEvent.click(screen.getByRole('button', { name: /Pause/ }));
    await userEvent.click(screen.getByRole('button', { name: /Play/ }));

    expect(arrangementStore.getState().playing).toBe(true);
    // Not exactly 420 — the scheduler's clock is already advancing, which is the point.
    expect(arrangementStore.getState().positionSec).toBeGreaterThanOrEqual(420);
  });

  it('reads out the playhead against the total length', async () => {
    render(<RemixView />);
    await screen.findByTestId('region-PAD-0');
    expect(screen.getByTestId('transport-clock')).toHaveTextContent('0:00 / 30:00');

    act(() => { arrangementStore.setState({ positionSec: 930 }); });
    expect(screen.getByTestId('transport-clock')).toHaveTextContent('15:30 / 30:00');
  });

  it('leaves a muted track out of the exported mix', async () => {
    render(<RemixView />);
    await screen.findByTestId('region-PAD-0');

    await userEvent.click(screen.getByRole('button', { name: 'Mute PAD' }));
    await userEvent.click(screen.getByRole('button', { name: /Export WAV/ }));

    await waitFor(() => expect(exportCtl.lastArgs).not.toBeNull());
    expect(exportCtl.lastArgs!.tracks.map((t) => t.id)).not.toContain('PAD');
    expect(exportCtl.lastArgs!.regions.map((r) => r.trackId)).not.toContain('PAD');
    expect(exportCtl.lastArgs!.tracks.map((t) => t.id)).toContain('MELODY');
  });

  it('reports loading then render progress while exporting', async () => {
    exportCtl.hold = true;
    render(<RemixView />);
    await screen.findByTestId('region-PAD-0');

    await userEvent.click(screen.getByRole('button', { name: /Export WAV/ }));
    // Nothing reports until every sample is decoded, so say so rather than showing a bare 0%.
    expect(screen.getByRole('button', { name: /Loading samples/ })).toBeInTheDocument();

    act(() => exportCtl.progress?.(0.42));
    expect(screen.getByRole('button', { name: /42%/ })).toBeInTheDocument();

    await act(async () => { exportCtl.release?.(); });
    await waitFor(() => expect(screen.getByRole('button', { name: /Export WAV/ })).toBeInTheDocument());
  });

  it('spells out each warning rather than only counting them', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      json: async () => ({ store: STORE, warnings: ['ELEMENT_SUB: no ETHER sample for the picked rule'] }),
    })));
    render(<RemixView />);
    await screen.findByTestId('region-PAD-0');
    expect(await screen.findByText(/no ETHER sample/)).toBeInTheDocument();
  });

  it('surfaces an export failure instead of failing silently', async () => {
    exportCtl.fail = true;
    render(<RemixView />);
    await screen.findByTestId('region-PAD-0');

    await userEvent.click(screen.getByRole('button', { name: /Export WAV/ }));

    expect(await screen.findByText(/Export failed/i)).toBeInTheDocument();
  });

  it('leaves no error showing after a successful export', async () => {
    render(<RemixView />);
    await screen.findByTestId('region-PAD-0');

    await userEvent.click(screen.getByRole('button', { name: /Export WAV/ }));

    await waitFor(() => expect(screen.queryByText(/Export failed/i)).toBeNull());
  });

  it('drops the categories the scoped element never authored', async () => {
    render(<RemixView />);
    await screen.findByTestId('region-PAD-0');

    await userEvent.click(screen.getByRole('button', { name: 'Scoped' }));
    await userEvent.click(screen.getByRole('button', { name: 'WATER' }));

    expect(screen.getByRole('button', { name: 'WATER' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('region-MELODY-0')).toBeInTheDocument();
    expect(screen.queryByTestId('region-PAD-0')).toBeNull();
  });
});
