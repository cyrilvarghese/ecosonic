import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { arrangementStore } from '@/arrange/arrangementStore';
import { RemixView } from './RemixView';

// RemixView mounts the real audio engine, which builds an AudioContext jsdom does not implement.
vi.mock('@/audio/AudioEngine', () => ({
  AudioEngine: class {
    setTracks = vi.fn(async () => {});
    setMasterVolume = vi.fn();
    // 40s samples: the PAD/MELODY 1:00 intervals are 1.5 loops, so "adjust" rounds them up to 2.
    getLayerDuration = vi.fn(() => 40);
    resumeContext = vi.fn();
    suspendContext = vi.fn();
    setTrackVolume = vi.fn();
    setTrackSend = vi.fn();
    setTrackEnvelope = vi.fn();
    setMute = vi.fn();
    triggerTrack = vi.fn();
    releaseTrack = vi.fn();
    clear = vi.fn();
  },
}));

// The scheduler's requestAnimationFrame loop mutates positionSec continuously, which races every
// assertion about the transport. Its behaviour is covered by useModuleScheduler.test.ts; here we
// only care that RemixView mounts it, which `mountedScheduler` records.
const { mountedScheduler } = vi.hoisted(() => ({ mountedScheduler: { count: 0 } }));
vi.mock('@/arrange/useModuleScheduler', () => ({
  useModuleScheduler: vi.fn(() => { mountedScheduler.count += 1; }),
}));

// One renderer mock the tests drive — `hold` keeps a render open so progress can be observed.
const { exportCtl } = vi.hoisted(() => ({
  exportCtl: {
    fail: false,
    hold: false,
    release: null as null | (() => void),
    progress: null as null | ((frac: number) => void),
    lastArgs: null as null | {
      tracks: { id: string }[];
      regions: { trackId: string; exitSec: number }[];
    },
  },
}));
vi.mock('@/remix/renderFreeMix', () => ({
  estimatedWavBytes: (totalSec: number) => totalSec * 44100 * 4 + 44,
  exportFreeMixWav: vi.fn(async (args: {
    onProgress?: (frac: number) => void;
    tracks: { id: string }[];
    regions: { trackId: string; exitSec: number }[];
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
  // Transport state as well: the scheduler keeps running against a store shared across tests.
  arrangementStore.setState({
    tracks: [], durationMin: 30, durationSec: 600, positionSec: 0, playing: false, scrubbing: false,
  });
});

describe('RemixView', () => {
  it('draws a mix with no Arrangement set up', async () => {
    render(<RemixView />);
    await screen.findByTestId('region-MELODY-0');
    expect(screen.queryByText(/Set up an Arrangement first/i)).toBeNull();
  });

  it('mounts the scheduler, without which nothing it plays can sound', async () => {
    mountedScheduler.count = 0;
    render(<RemixView />);
    await screen.findByTestId('region-MELODY-0');
    expect(mountedScheduler.count).toBeGreaterThan(0);
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

  it('installs the mix even when starting from a scrubbed position', async () => {
    render(<RemixView />);
    await screen.findByTestId('region-PAD-0');

    // Drag the playhead before ever pressing Play — the store still holds the Layer Two module
    // template that initFrom seeded, which only spans config.layerTwo.moduleSeconds. Scrub through
    // the real strip rather than poking the store, so the view is guaranteed to be in step.
    // seek() clamps to durationSec, which useRemix sizes in an effect — scrubbing before that lands
    // would clamp 15:00 down to the 10:00 default and the test would be measuring the wrong thing.
    await waitFor(() => expect(arrangementStore.getState().durationSec).toBe(1800));

    const strip = screen.getByTestId('scrub-strip');
    strip.getBoundingClientRect = () => ({
      left: 0, width: 1000, right: 1000, top: 0, bottom: 0, height: 0, x: 0, y: 0, toJSON: () => ({}),
    });
    strip.setPointerCapture = vi.fn();
    fireEvent.pointerDown(strip, { clientX: 500, pointerId: 1 }); // halfway = 15:00 of 30:00

    await waitFor(() => expect(screen.getByTestId('transport-clock')).toHaveTextContent('15:00'));
    await userEvent.click(screen.getByRole('button', { name: /Play/ }));

    const st = arrangementStore.getState();
    expect(st.durationSec).toBe(1800);
    expect(st.moduleRegions.some((r) => r.enterSec >= 600)).toBe(true); // not a 0..600 template
    expect(st.positionSec).toBeGreaterThanOrEqual(900); // and it did not jump back to the start
  });

  it('resumes from the paused position instead of restarting', async () => {
    render(<RemixView />);
    await screen.findByTestId('region-PAD-0');
    await userEvent.click(screen.getByRole('button', { name: /Play/ }));

    act(() => { arrangementStore.setState({ positionSec: 420 }); });
    await userEvent.click(screen.getByRole('button', { name: /Pause/ }));
    await userEvent.click(screen.getByRole('button', { name: /Play/ }));

    expect(arrangementStore.getState().playing).toBe(true);
    expect(arrangementStore.getState().positionSec).toBe(420); // resumed, not restarted at 0
  });

  it('reads out the playhead against the total length', async () => {
    render(<RemixView />);
    await screen.findByTestId('region-PAD-0');
    expect(screen.getByTestId('transport-clock')).toHaveTextContent('0:00 / 30:00');

    act(() => { arrangementStore.setState({ positionSec: 930 }); });
    expect(screen.getByTestId('transport-clock')).toHaveTextContent('15:30 / 30:00');
  });

  it('leaves intervals as authored until asked to adjust them', async () => {
    render(<RemixView />);
    await screen.findByTestId('region-PAD-0');
    expect(screen.getByRole('checkbox', { name: /whole loops/i })).not.toBeChecked();
    await waitFor(() =>
      expect(within(screen.getByTestId('region-PAD-0')).getByTestId('interval-length'))
        .toHaveTextContent('1:00'));
  });

  it('rounds an interval to whole loops when adjust is ticked', async () => {
    render(<RemixView />);
    await screen.findByTestId('region-PAD-0');
    // Wait for the engine to report sample lengths — nothing can be adjusted before that.
    await waitFor(() => expect(arrangementStore.getState().trackDurations.PAD).toBe(40));

    await userEvent.click(screen.getByRole('checkbox', { name: /whole loops/i }));

    // 1:00 over a 0:40 sample = 1.5 loops → rounds up to 2 → 1:20.
    expect(within(screen.getByTestId('region-PAD-0')).getByTestId('interval-length'))
      .toHaveTextContent('1:20');
  });

  it('exports the adjusted intervals, not the authored ones', async () => {
    render(<RemixView />);
    await screen.findByTestId('region-PAD-0');
    await waitFor(() => expect(arrangementStore.getState().trackDurations.PAD).toBe(40));

    await userEvent.click(screen.getByRole('checkbox', { name: /whole loops/i }));
    await userEvent.click(screen.getByRole('button', { name: /Export WAV/ }));

    await waitFor(() => expect(exportCtl.lastArgs).not.toBeNull());
    expect(exportCtl.lastArgs!.regions.find((r) => r.trackId === 'PAD')?.exitSec).toBe(80);
  });

  it('plays the adjusted intervals, not the authored ones', async () => {
    render(<RemixView />);
    await screen.findByTestId('region-PAD-0');
    await waitFor(() => expect(arrangementStore.getState().trackDurations.PAD).toBe(40));

    await userEvent.click(screen.getByRole('checkbox', { name: /whole loops/i }));
    await userEvent.click(screen.getByRole('button', { name: /Play/ }));

    const pad = arrangementStore.getState().moduleRegions.find((r) => r.trackId === 'PAD');
    expect(pad?.exitSec).toBe(80);
  });

  it('uploads a session under the element chosen for it', async () => {
    const posts: { element?: string; filename?: string }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: { body?: string }) => {
      if (init?.body) posts.push(JSON.parse(init.body));
      return { ok: true, json: async () => ({ store: STORE, warnings: [] }) };
    }));

    render(<RemixView />);
    await screen.findByTestId('region-PAD-0');

    await userEvent.click(screen.getByRole('button', { name: /upload as/i }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'FIRE' }));

    await userEvent.upload(
      screen.getByLabelText(/session file/i),
      new File(['# timeline'], 'My Session.md', { type: 'text/markdown' }),
    );

    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].element).toBe('FIRE');
    expect(posts[0].filename).toBe('My Session.md');
  });

  it('opens the file picker as soon as an element is chosen', async () => {
    render(<RemixView />);
    await screen.findByTestId('region-PAD-0');
    const picker = vi.spyOn(screen.getByLabelText(/session file/i), 'click').mockImplementation(() => {});

    await userEvent.click(screen.getByRole('button', { name: /upload as/i }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'FIRE' }));

    expect(picker).toHaveBeenCalled();
  });

  it('carries the element it will file under on the control itself', async () => {
    render(<RemixView />);
    await screen.findByTestId('region-PAD-0');
    expect(screen.getByRole('button', { name: /upload as EARTH/i })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /upload as/i }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'ETHER' }));

    expect(screen.getByRole('button', { name: /upload as ETHER/i })).toBeInTheDocument();
  });

  it('reports an upload the server rejected', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: { body?: string }) => {
      if (init?.body) return { ok: false, json: async () => ({ error: 'no parsable rules' }) };
      return { ok: true, json: async () => ({ store: STORE, warnings: [] }) };
    }));

    render(<RemixView />);
    await screen.findByTestId('region-PAD-0');

    await userEvent.upload(
      screen.getByLabelText(/session file/i),
      new File(['nonsense'], 'bad.md', { type: 'text/markdown' }),
    );

    expect(await screen.findByText(/no parsable rules/i)).toBeInTheDocument();
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

describe('RemixView — borrowed timings', () => {
  it('offers a third mode that keeps the element chips, captioned as sound', async () => {
    render(<RemixView />);
    await screen.findByTestId('region-PAD-0');

    await userEvent.click(screen.getByRole('button', { name: 'Borrowed timings' }));

    expect(screen.getByRole('button', { name: 'Borrowed timings' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Cross-element' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('Sound:')).toBeInTheDocument();
    for (const el of ['EARTH', 'WATER', 'AIR', 'FIRE', 'ETHER']) {
      expect(screen.getByRole('button', { name: el })).toBeInTheDocument();
    }
  });

  it('names the element whose samples every track will play', async () => {
    render(<RemixView />);
    await screen.findByTestId('region-PAD-0');

    await userEvent.click(screen.getByRole('button', { name: 'Borrowed timings' }));
    await userEvent.click(screen.getByRole('button', { name: 'FIRE' }));

    expect(screen.getByText(/every track plays FIRE's samples, on timings drawn from every element/))
      .toBeInTheDocument();
  });

  it('shows no Sound caption when Scoped is the mode', async () => {
    render(<RemixView />);
    await screen.findByTestId('region-PAD-0');

    await userEvent.click(screen.getByRole('button', { name: 'Scoped' }));

    expect(screen.getByRole('button', { name: 'EARTH' })).toBeInTheDocument();
    expect(screen.queryByText('Sound:')).not.toBeInTheDocument();
  });

  it('keeps every category the pool covers, whatever the chosen element authored', async () => {
    render(<RemixView />);
    await screen.findByTestId('region-PAD-0');

    // Scoped to ETHER there is nothing at all; borrowed from ETHER the whole pool plays.
    await userEvent.click(screen.getByRole('button', { name: 'Borrowed timings' }));
    await userEvent.click(screen.getByRole('button', { name: 'ETHER' }));

    expect(screen.getByTestId('region-PAD-0')).toBeInTheDocument();
    expect(screen.getByTestId('region-MELODY-0')).toBeInTheDocument();
  });

  it('colours every bar by the sample element while chips keep their own', async () => {
    const { container } = render(<RemixView />);
    await screen.findByTestId('region-PAD-0');

    await userEvent.click(screen.getByRole('button', { name: 'Borrowed timings' }));
    await userEvent.click(screen.getByRole('button', { name: 'ETHER' }));

    // What you HEAR is one element, so every bar is one colour.
    const bars = container.querySelectorAll('[data-testid^="region-"]');
    expect(bars.length).toBeGreaterThan(0);
    expect([...bars].every((b) => b.getAttribute('data-element') === 'ether')).toBe(true);

    // Where the TIMING came from is the interesting information here, so the chips still differ.
    const chips = container.querySelectorAll('.cursor-help[data-element]');
    const chipElements = new Set([...chips].map((c) => c.getAttribute('data-element')));
    expect(chipElements.has('ether')).toBe(false);
    expect(chipElements).toEqual(new Set(['water', 'fire']));
  });
});
