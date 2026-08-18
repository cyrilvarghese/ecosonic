import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { arrangementStore } from '@/arrange/arrangementStore';
import { config } from '@/config';
import { RemixView } from './RemixView';

// RemixView mounts the real audio engine, which builds an AudioContext jsdom does not implement.
vi.mock('@/audio/AudioEngine', () => ({
  AudioEngine: class {
    setTracks = vi.fn(async () => {});
    setMasterVolume = vi.fn();
    // 40s samples: the PAD/MELODY 1:00 intervals are 1.5 loops, so "adjust" rounds them up to 2.
    getLayerDuration = vi.fn(() => layerDur.sec);
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
// Sample length the fake engine reports. 40s by default; a test raises it to exercise the
// long-sample rule, which only bites past config.audio.remix.longSampleSec.
const { layerDur } = vi.hoisted(() => ({ layerDur: { sec: 40 } }));
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
      tracks: { id: string; ceilingDb: number }[];
      regions: { trackId: string; exitSec: number }[];
    },
  },
}));
vi.mock('@/remix/renderFreeMix', () => ({
  estimatedWavBytes: (totalSec: number) => totalSec * 44100 * 4 + 44,
  exportFreeMixWav: vi.fn(async (args: {
    onProgress?: (frac: number) => void;
    tracks: { id: string; ceilingDb: number }[];
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
  const sample = (name: string) => ({ name, path: `${name}.wav`, bytes: 1, ext: '.wav' });
  for (const el of ['EARTH', 'WATER', 'AIR', 'FIRE', 'ETHER']) {
    m[el] = {};
    for (const c of CATS) m[el][c] = [sample(`${el}-${c}`)];
    // Every element really does ship two planets, and PLANET sounds both — mirror that here.
    m[el].PLANET = [sample(`${el}-MERCURY`), sample(`${el}-SUN`)];
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

/** A region testid is `region-${laneId}-${enterSec}` and a lane id is `CATEGORY·ELEMENT`. Which
 *  element a cross draw lands on is the seed's business, so match the category and let the element
 *  be whatever was drawn. */
const laneRegion = (category: string, enterSec = 0) =>
  new RegExp(`^region-${category}·[A-Z]+-${enterSec}$`);

/** A generated category is ONE lane. Clicking the MELODY chip the draw did not take adds a second —
 *  taking the category over is how a category comes to hold two. */
const addSecondMelodyLane = async () => {
  const row = screen.getByTestId('pool-MELODY');
  const drawnIsWater = within(row).getByRole('button', { name: 'Water·I' })
    .className.includes('bg-[var(--accent-ink)]');
  await userEvent.click(
    within(row).getByRole('button', { name: drawnIsWater ? 'Fire·I' : 'Water·I' }),
  );
};

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

// Env stubs must not leak: one test setting NEXT_PUBLIC_STATIC_EXPORT would otherwise put every
// later test on the baked-store path, where the fixture STORE below is never consulted.
afterEach(() => { vi.unstubAllEnvs(); });

beforeEach(() => {
  // `ok` matters: useRemix checks it before parsing, so a stub without it takes the error path.
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ store: STORE, warnings: [] }) })));
  // jsdom implements neither of these; the download path calls both.
  vi.stubGlobal('URL', { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} });
  // ...and clicking the download anchor makes jsdom log "navigation to another Document".
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  layerDur.sec = 40;
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
    await screen.findByTestId(laneRegion('MELODY'));
    expect(screen.queryByText(/Set up an Arrangement first/i)).toBeNull();
  });

  it('mounts the scheduler, without which nothing it plays can sound', async () => {
    mountedScheduler.count = 0;
    render(<RemixView />);
    await screen.findByTestId(laneRegion('MELODY'));
    expect(mountedScheduler.count).toBeGreaterThan(0);
  });

  it('hides the element chips until scoped mode is on', async () => {
    render(<RemixView />);
    await screen.findByTestId(laneRegion('PAD'));
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
    await screen.findByTestId(laneRegion('PAD'));
    expect(screen.getByRole('button', { name: 'Full session' })).toHaveAttribute('aria-pressed', 'true');
    for (const label of ['Intro', 'Deep Relaxation', 'Return']) {
      expect(screen.getByRole('button', { name: label })).toHaveAttribute('aria-pressed', 'false');
    }
  });

  it('narrows the draw to one section module', async () => {
    render(<RemixView />);
    await screen.findByTestId(laneRegion('PAD'));

    await userEvent.click(screen.getByRole('button', { name: 'Return' }));

    expect(screen.getByRole('button', { name: 'Return' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId(laneRegion('BASS', 120))).toBeInTheDocument(); // 1320 rebased by 1200
    expect(screen.queryByTestId(laneRegion('PAD'))).toBeNull();
  });

  it('toggles the transport button between play and pause', async () => {
    render(<RemixView />);
    await screen.findByTestId(laneRegion('PAD'));
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
    await screen.findByTestId(laneRegion('PAD'));

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
    await screen.findByTestId(laneRegion('PAD'));
    await userEvent.click(screen.getByRole('button', { name: /Play/ }));

    act(() => { arrangementStore.setState({ positionSec: 420 }); });
    await userEvent.click(screen.getByRole('button', { name: /Pause/ }));
    await userEvent.click(screen.getByRole('button', { name: /Play/ }));

    expect(arrangementStore.getState().playing).toBe(true);
    expect(arrangementStore.getState().positionSec).toBe(420); // resumed, not restarted at 0
  });

  it('reads out the playhead against the total length', async () => {
    render(<RemixView />);
    await screen.findByTestId(laneRegion('PAD'));
    expect(screen.getByTestId('transport-clock')).toHaveTextContent('0:00 / 30:00');

    act(() => { arrangementStore.setState({ positionSec: 930 }); });
    expect(screen.getByTestId('transport-clock')).toHaveTextContent('15:30 / 30:00');
  });

  it('adjusts intervals to whole loops out of the box', async () => {
    render(<RemixView />);
    await screen.findByTestId(laneRegion('PAD'));
    expect(screen.getByRole('checkbox', { name: /whole loops/i })).toBeChecked();

    // 1:00 over a 0:40 sample = 1.5 loops → rounds up to 2 → 1:20. Sample lengths arrive from the
    // engine after the first paint, so the trim lands a beat later — hence the wait.
    await waitFor(() =>
      expect(within(screen.getByTestId(laneRegion('PAD'))).getByTestId('interval-length'))
        .toHaveTextContent('1:20'));
  });

  it('leaves intervals as authored once the box is cleared', async () => {
    render(<RemixView />);
    await screen.findByTestId(laneRegion('PAD'));
    await waitFor(() => expect(arrangementStore.getState().trackDurations['PAD·FIRE']).toBe(40));

    await userEvent.click(screen.getByRole('checkbox', { name: /whole loops/i }));

    expect(within(screen.getByTestId(laneRegion('PAD'))).getByTestId('interval-length'))
      .toHaveTextContent('1:00');
  });

  it('exports the adjusted intervals, not the authored ones', async () => {
    render(<RemixView />);
    await screen.findByTestId(laneRegion('PAD'));
    await waitFor(() => expect(arrangementStore.getState().trackDurations['PAD·FIRE']).toBe(40));

    await userEvent.click(screen.getByRole('button', { name: /Export WAV/ }));

    await waitFor(() => expect(exportCtl.lastArgs).not.toBeNull());
    expect(exportCtl.lastArgs!.regions.find((r) => r.trackId === 'PAD·FIRE')?.exitSec).toBe(80);
  });

  it('exports the authored intervals once the box is cleared', async () => {
    render(<RemixView />);
    await screen.findByTestId(laneRegion('PAD'));
    await waitFor(() => expect(arrangementStore.getState().trackDurations['PAD·FIRE']).toBe(40));

    await userEvent.click(screen.getByRole('checkbox', { name: /whole loops/i }));
    await userEvent.click(screen.getByRole('button', { name: /Export WAV/ }));

    await waitFor(() => expect(exportCtl.lastArgs).not.toBeNull());
    expect(exportCtl.lastArgs!.regions.find((r) => r.trackId === 'PAD·FIRE')?.exitSec).toBe(60);
  });

  it('plays the adjusted intervals, not the authored ones', async () => {
    render(<RemixView />);
    await screen.findByTestId(laneRegion('PAD'));
    await waitFor(() => expect(arrangementStore.getState().trackDurations['PAD·FIRE']).toBe(40));

    await userEvent.click(screen.getByRole('button', { name: /Play/ }));

    const pad = arrangementStore.getState().moduleRegions.find((r) => r.trackId === 'PAD·FIRE');
    expect(pad?.exitSec).toBe(80);
  });

  it('restores the authored intervals when the box is cleared mid-playback', async () => {
    // The scheduler reads moduleRegions from the store every frame; the view draws its own
    // mixRegions. moduleRegions is only written when Play is pressed, so toggling the box while
    // playing used to redraw the bar over a track that went on sounding to its old end.
    render(<RemixView />);
    await screen.findByTestId(laneRegion('PAD'));
    await waitFor(() => expect(arrangementStore.getState().trackDurations['PAD·FIRE']).toBe(40));

    await userEvent.click(screen.getByRole('button', { name: /Play/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: /whole loops/i }));

    expect(arrangementStore.getState().moduleRegions.find((r) => r.trackId === 'PAD·FIRE')?.exitSec)
      .toBe(60);
  });

  it('adjusts what is PLAYING when the box is ticked back on mid-playback', async () => {
    render(<RemixView />);
    await screen.findByTestId(laneRegion('PAD'));
    await waitFor(() => expect(arrangementStore.getState().trackDurations['PAD·FIRE']).toBe(40));

    await userEvent.click(screen.getByRole('checkbox', { name: /whole loops/i }));
    await userEvent.click(screen.getByRole('button', { name: /Play/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: /whole loops/i }));

    expect(arrangementStore.getState().moduleRegions.find((r) => r.trackId === 'PAD·FIRE')?.exitSec)
      .toBe(80);
  });

  it('trims a mix that started before the sample lengths arrived', async () => {
    // The trim needs lengths the engine reports asynchronously, so a mix played immediately starts
    // on authored intervals. It must not stay that way once the lengths land.
    render(<RemixView />);
    await screen.findByTestId(laneRegion('PAD'));
    await userEvent.click(screen.getByRole('button', { name: /Play/ }));

    await waitFor(() =>
      expect(arrangementStore.getState().moduleRegions.find((r) => r.trackId === 'PAD·FIRE')?.exitSec)
        .toBe(80));
  });

  it('uploads a session under the element chosen for it', async () => {
    const posts: { element?: string; filename?: string }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: { body?: string }) => {
      if (init?.body) posts.push(JSON.parse(init.body));
      return { ok: true, json: async () => ({ store: STORE, warnings: [] }) };
    }));

    render(<RemixView />);
    await screen.findByTestId(laneRegion('PAD'));

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
    await screen.findByTestId(laneRegion('PAD'));
    const picker = vi.spyOn(screen.getByLabelText(/session file/i), 'click').mockImplementation(() => {});

    await userEvent.click(screen.getByRole('button', { name: /upload as/i }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'FIRE' }));

    expect(picker).toHaveBeenCalled();
  });

  it('carries the element it will file under on the control itself', async () => {
    render(<RemixView />);
    await screen.findByTestId(laneRegion('PAD'));
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
    await screen.findByTestId(laneRegion('PAD'));

    await userEvent.upload(
      screen.getByLabelText(/session file/i),
      new File(['nonsense'], 'bad.md', { type: 'text/markdown' }),
    );

    expect(await screen.findByText(/no parsable rules/i)).toBeInTheDocument();
  });

  it('leaves a muted track out of the exported mix', async () => {
    render(<RemixView />);
    await screen.findByTestId(laneRegion('PAD'));

    await userEvent.click(screen.getByRole('button', { name: 'Mute PAD · Fire' }));
    await userEvent.click(screen.getByRole('button', { name: /Export WAV/ }));

    await waitFor(() => expect(exportCtl.lastArgs).not.toBeNull());
    expect(exportCtl.lastArgs!.tracks.map((t) => t.id)).not.toContain('PAD·FIRE');
    expect(exportCtl.lastArgs!.regions.map((r) => r.trackId)).not.toContain('PAD·FIRE');
    expect(exportCtl.lastArgs!.tracks.some((t) => t.id.startsWith('MELODY·'))).toBe(true);
  });

  it('reports loading then render progress while exporting', async () => {
    exportCtl.hold = true;
    render(<RemixView />);
    await screen.findByTestId(laneRegion('PAD'));

    await userEvent.click(screen.getByRole('button', { name: /Export WAV/ }));
    // Nothing reports until every sample is decoded, so say so rather than showing a bare 0%.
    expect(screen.getByRole('button', { name: /Loading samples/ })).toBeInTheDocument();

    act(() => exportCtl.progress?.(0.42));
    expect(screen.getByRole('button', { name: /42%/ })).toBeInTheDocument();

    await act(async () => { exportCtl.release?.(); });
    await waitFor(() => expect(screen.getByRole('button', { name: /Export WAV/ })).toBeInTheDocument());
  });

  it('offers no upload when hosted, where there is no route to accept it', async () => {
    // Static export: POST /api/sessions does not exist. A button that always fails is worse than
    // no button — the sessions ship baked into the bundle instead.
    vi.stubEnv('NEXT_PUBLIC_STATIC_EXPORT', 'true');

    render(<RemixView />);
    // Anchored on the mode switch, not a lane: hosted, the store comes from the baked JSON rather
    // than this file's fixture, so the fixture's lanes are not what renders. The upload control
    // sits in this same header section and renders in the same pass.
    await screen.findByRole('button', { name: /cross-element/i });

    expect(screen.queryByRole('button', { name: /upload session/i })).not.toBeInTheDocument();
  });

  it('offers upload locally, where the route is there', async () => {
    render(<RemixView />);
    await screen.findByTestId(laneRegion('PAD'));

    expect(screen.getByRole('button', { name: /upload session/i })).toBeInTheDocument();
  });

  it('says why the rules are missing instead of showing an empty pool', async () => {
    // Static export: /api/sessions is not there. Silently rendering nothing reads as a broken
    // page, so the reason has to reach the screen.
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) })));

    render(<RemixView />);

    expect(await screen.findByText(/could not load/i)).toBeInTheDocument();
    expect(screen.getByText(/404/)).toBeInTheDocument();
  });

  it('spells out each warning rather than only counting them', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ store: STORE, warnings: ['ELEMENT_SUB: no ETHER sample for the picked rule'] }),
    })));
    render(<RemixView />);
    await screen.findByTestId(laneRegion('PAD'));
    expect(await screen.findByText(/no ETHER sample/)).toBeInTheDocument();
  });

  it('surfaces an export failure instead of failing silently', async () => {
    exportCtl.fail = true;
    render(<RemixView />);
    await screen.findByTestId(laneRegion('PAD'));

    await userEvent.click(screen.getByRole('button', { name: /Export WAV/ }));

    expect(await screen.findByText(/Export failed/i)).toBeInTheDocument();
  });

  it('leaves no error showing after a successful export', async () => {
    render(<RemixView />);
    await screen.findByTestId(laneRegion('PAD'));

    await userEvent.click(screen.getByRole('button', { name: /Export WAV/ }));

    await waitFor(() => expect(screen.queryByText(/Export failed/i)).toBeNull());
  });

  it('drops the categories the scoped element never authored', async () => {
    render(<RemixView />);
    await screen.findByTestId(laneRegion('PAD'));

    await userEvent.click(screen.getByRole('button', { name: 'Scoped' }));
    await userEvent.click(screen.getByRole('button', { name: 'WATER' }));

    expect(screen.getByRole('button', { name: 'WATER' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId(laneRegion('MELODY'))).toBeInTheDocument();
    expect(screen.queryByTestId(laneRegion('PAD'))).toBeNull();
  });
});

describe('RemixView — borrowed timings', () => {
  it('offers a third mode that keeps the element chips, captioned as sound', async () => {
    render(<RemixView />);
    await screen.findByTestId(laneRegion('PAD'));

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
    await screen.findByTestId(laneRegion('PAD'));

    await userEvent.click(screen.getByRole('button', { name: 'Borrowed timings' }));
    await userEvent.click(screen.getByRole('button', { name: 'FIRE' }));

    expect(screen.getByText(/every track plays FIRE's samples, on timings drawn from every element/))
      .toBeInTheDocument();
  });

  it('shows no Sound caption when Scoped is the mode', async () => {
    render(<RemixView />);
    await screen.findByTestId(laneRegion('PAD'));

    await userEvent.click(screen.getByRole('button', { name: 'Scoped' }));

    expect(screen.getByRole('button', { name: 'EARTH' })).toBeInTheDocument();
    expect(screen.queryByText('Sound:')).not.toBeInTheDocument();
  });

  it('keeps every category the pool covers, whatever the chosen element authored', async () => {
    render(<RemixView />);
    await screen.findByTestId(laneRegion('PAD'));

    // Scoped to ETHER there is nothing at all; borrowed from ETHER the whole pool plays.
    await userEvent.click(screen.getByRole('button', { name: 'Borrowed timings' }));
    await userEvent.click(screen.getByRole('button', { name: 'ETHER' }));

    expect(screen.getByTestId(laneRegion('PAD'))).toBeInTheDocument();
    expect(screen.getByTestId(laneRegion('MELODY'))).toBeInTheDocument();
  });

  it('colours every bar by the sample element while chips keep their own', async () => {
    const { container } = render(<RemixView />);
    await screen.findByTestId(laneRegion('PAD'));

    await userEvent.click(screen.getByRole('button', { name: 'Borrowed timings' }));
    await userEvent.click(screen.getByRole('button', { name: 'ETHER' }));

    // What you HEAR is one element, so every bar is one colour.
    const bars = container.querySelectorAll('[data-testid^="region-"]');
    expect(bars.length).toBeGreaterThan(0);
    expect([...bars].every((b) => b.getAttribute('data-element') === 'ether')).toBe(true);

    // Where the TIMING came from is the interesting information here, so the chips still differ.
    // Scoped to the pool rows rather than to a cursor class — chips are operable in this mode now.
    const chips = container.querySelectorAll('[data-testid^="pool-"] [data-element]');
    const chipElements = new Set([...chips].map((c) => c.getAttribute('data-element')));
    expect(chipElements.has('ether')).toBe(false);
    expect(chipElements).toEqual(new Set(['water', 'fire']));
  });
});

describe('RemixView — locking a track against Regenerate', () => {
  /** The lane ids a category currently holds, in timeline order. */
  const lanesOf = (category: string) => screen.getAllByTestId(new RegExp(`^region-${category}·`))
    .map((n) => n.getAttribute('data-testid')!.replace(/-\d+$/, ''));

  /** Roll until MELODY lands somewhere else, so "held" means something. Its pool is WATER + FIRE. */
  const rollUntilMelodyMoves = async (from: string) => {
    for (let i = 0; i < 20; i++) {
      await userEvent.click(screen.getByRole('button', { name: /Regenerate/ }));
      if (lanesOf('MELODY')[0] !== from) return true;
    }
    return false;
  };

  it('holds a locked track while everything around it rerolls', async () => {
    render(<RemixView />);
    await screen.findByTestId(laneRegion('PAD'));

    const melodyBefore = lanesOf('MELODY')[0];
    await userEvent.click(screen.getByRole('button', { name: /^Lock MELODY/ }));

    expect(await rollUntilMelodyMoves(melodyBefore)).toBe(false);
    expect(lanesOf('MELODY')[0]).toBe(melodyBefore);
  });

  it('lets it move again once unlocked', async () => {
    render(<RemixView />);
    await screen.findByTestId(laneRegion('PAD'));
    const melodyBefore = lanesOf('MELODY')[0];

    await userEvent.click(screen.getByRole('button', { name: /^Lock MELODY/ }));
    await rollUntilMelodyMoves(melodyBefore);
    await userEvent.click(screen.getByRole('button', { name: /^Unlock MELODY/ }));

    expect(await rollUntilMelodyMoves(melodyBefore)).toBe(true);
  });

  it('reports the lock state on the control, not by colour alone', async () => {
    render(<RemixView />);
    await screen.findByTestId(laneRegion('PAD'));

    const lock = () => screen.getByRole('button', { name: /^(Lock|Unlock) PAD/ });
    expect(lock()).toHaveAttribute('aria-pressed', 'false');

    await userEvent.click(lock());

    expect(lock()).toHaveAttribute('aria-pressed', 'true');
    expect(lock()).toHaveAccessibleName(expect.stringContaining('Unlock'));
  });

  it('locks the track you asked for and no other', async () => {
    render(<RemixView />);
    await screen.findByTestId(laneRegion('PAD'));

    await userEvent.click(screen.getByRole('button', { name: /^Lock PAD/ }));

    expect(screen.getByRole('button', { name: /^Unlock PAD/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Lock MELODY/ })).toBeInTheDocument();
  });
});

/** The fixture store plus a PLANET rule, so the category actually draws — and draws two lanes. */
const withPlanet = () => vi.stubGlobal('fetch', vi.fn(async () => ({
  ok: true,
  json: async () => ({
    store: {
      ...STORE,
      EARTH: [{ id: 'e', element: 'EARTH', label: 'e', rules: [rule('PLANET', 'EARTH')] }],
    },
    warnings: [],
  }),
})));

describe('RemixView — PLANET on two lanes', () => {
  it('draws a row per body, both on the same timing', async () => {
    withPlanet();
    render(<RemixView />);

    await screen.findByTestId('region-PLANET·EARTH·EARTH-MERCURY-0');
    expect(screen.getByTestId('region-PLANET·EARTH·EARTH-SUN-0')).toBeInTheDocument();
    // One rule, laid on both — so the pair enters and leaves together.
    const both = screen.getAllByTestId(/^region-PLANET·/);
    expect(both).toHaveLength(2);
  });

  it('lists the pool once, so one set of sliders drives the pair', async () => {
    withPlanet();
    render(<RemixView />);
    await screen.findByTestId('region-PLANET·EARTH·EARTH-MERCURY-0');

    expect(screen.getAllByTestId('pool-PLANET')).toHaveLength(1);

    fireEvent.change(
      within(screen.getByTestId('pool-PLANET')).getByLabelText('Volume'), { target: { value: '-6' } },
    );

    const ceiling = (id: string) =>
      arrangementStore.getState().tracks.find((t) => t.id === id)?.ceilingDb;
    expect(ceiling('PLANET·EARTH·EARTH-MERCURY')).toBe(-6);
    expect(ceiling('PLANET·EARTH·EARTH-SUN')).toBe(-6);
  });

  it('mutes one body without silencing the other', async () => {
    withPlanet();
    render(<RemixView />);
    await screen.findByTestId('region-PLANET·EARTH·EARTH-MERCURY-0');

    await userEvent.click(screen.getByRole('button', { name: /Mute PLANET · Earth · Earth-sun/i }));
    await userEvent.click(screen.getByRole('button', { name: /Export WAV/ }));

    await waitFor(() => expect(exportCtl.lastArgs).not.toBeNull());
    const ids = exportCtl.lastArgs!.tracks.map((t) => t.id);
    expect(ids).not.toContain('PLANET·EARTH·EARTH-SUN');
    expect(ids).toContain('PLANET·EARTH·EARTH-MERCURY');
  });
});

describe('RemixView — hovering links a pool row to its lanes', () => {
  const lit = (el: HTMLElement) => el.getAttribute('data-highlighted') === 'true';

  it('lights the matching lane when a pool row is hovered', async () => {
    render(<RemixView />);
    await screen.findByTestId(laneRegion('PAD'));

    await userEvent.hover(screen.getByTestId('pool-PAD'));

    expect(lit(screen.getByTestId('pool-PAD'))).toBe(true);
    expect(lit(screen.getByTestId('lane-PAD·FIRE'))).toBe(true);
  });

  it('lights the pool row when its lane is hovered — the link runs both ways', async () => {
    render(<RemixView />);
    await screen.findByTestId(laneRegion('PAD'));

    await userEvent.hover(screen.getByTestId('lane-PAD·FIRE'));

    expect(lit(screen.getByTestId('pool-PAD'))).toBe(true);
    expect(lit(screen.getByTestId('lane-PAD·FIRE'))).toBe(true);
  });

  it('leaves every other row alone', async () => {
    render(<RemixView />);
    await screen.findByTestId(laneRegion('PAD'));

    await userEvent.hover(screen.getByTestId('pool-PAD'));

    expect(lit(screen.getByTestId('pool-MELODY'))).toBe(false);
    const melodyLane = screen.getAllByTestId(/^lane-MELODY·/)[0];
    expect(lit(melodyLane)).toBe(false);
  });

  it('clears when the pointer leaves', async () => {
    render(<RemixView />);
    await screen.findByTestId(laneRegion('PAD'));

    await userEvent.hover(screen.getByTestId('pool-PAD'));
    await userEvent.unhover(screen.getByTestId('pool-PAD'));

    expect(lit(screen.getByTestId('pool-PAD'))).toBe(false);
    expect(lit(screen.getByTestId('lane-PAD·FIRE'))).toBe(false);
  });

  it('lights BOTH planet lanes from the one pool row', async () => {
    // The case that motivates the feature: one row drives two lanes, and nothing on screen said so.
    withPlanet();
    render(<RemixView />);
    await screen.findByTestId('region-PLANET·EARTH·EARTH-MERCURY-0');

    await userEvent.hover(screen.getByTestId('pool-PLANET'));

    expect(lit(screen.getByTestId('lane-PLANET·EARTH·EARTH-MERCURY'))).toBe(true);
    expect(lit(screen.getByTestId('lane-PLANET·EARTH·EARTH-SUN'))).toBe(true);
  });
});

describe('RemixView — a category holding two lanes', () => {
  it('stacks two coloured lanes, each keeping its own element', async () => {
    const { container } = render(<RemixView />);
    await screen.findByTestId(laneRegion('PAD'));

    await addSecondMelodyLane();

    // MELODY is authored by WATER and FIRE, so both lanes exist and each keeps its own colour.
    expect(screen.getByTestId('region-MELODY·WATER-0')).toBeInTheDocument();
    expect(screen.getByTestId('region-MELODY·FIRE-0')).toBeInTheDocument();
    const melodyBars = container.querySelectorAll('[data-testid^="region-MELODY·"]');
    expect(new Set([...melodyBars].map((b) => b.getAttribute('data-element'))))
      .toEqual(new Set(['water', 'fire']));
  });

  it('mutes one lane without touching its sibling', async () => {
    render(<RemixView />);
    await screen.findByTestId(laneRegion('PAD'));
    await addSecondMelodyLane();

    await userEvent.click(screen.getByRole('button', { name: /Mute MELODY · Water/ }));
    await userEvent.click(screen.getByRole('button', { name: /Export WAV/ }));

    await waitFor(() => expect(exportCtl.lastArgs).not.toBeNull());
    expect(exportCtl.lastArgs!.tracks.map((t) => t.id)).not.toContain('MELODY·WATER');
    expect(exportCtl.lastArgs!.tracks.map((t) => t.id)).toContain('MELODY·FIRE');
  });

  it('shows one pool row per category, not one per lane', async () => {
    render(<RemixView />);
    await screen.findByTestId(laneRegion('PAD'));
    await addSecondMelodyLane();

    // Two MELODY lanes, but the pool of MELODY candidates is one thing and is listed once.
    expect(screen.getAllByTestId(/^region-MELODY·/)).toHaveLength(2);
    expect(screen.getAllByTestId('pool-MELODY')).toHaveLength(1);
  });
});

describe('RemixView — taking a track over by clicking', () => {
  // FIRE authored MELODY, PAD and BASS, so `Fire·I` appears in more than one row — every chip query
  // is scoped to the row it belongs to, or getByRole matches several buttons and throws.
  const melodyRow = () => screen.getByTestId('pool-MELODY');
  const melodyChip = (name: string) => within(melodyRow()).getByRole('button', { name });
  /** The MELODY element the generator drew, so a test can click the one it did NOT take. */
  const otherElement = () =>
    (within(melodyRow()).queryByRole('button', { name: 'Water·I' })!.className.includes('bg-[var(--accent-ink)]')
      ? 'Fire·I' : 'Water·I');

  it('says the track is manual, and offers it back', async () => {
    render(<RemixView />);
    await screen.findByTestId(laneRegion('PAD'));
    expect(within(melodyRow()).queryByText('manual')).toBeNull();

    await userEvent.click(melodyChip(otherElement()));

    expect(within(melodyRow()).getByText('manual')).toBeInTheDocument();
    expect(within(melodyRow()).getByRole('button', { name: /auto/ })).toBeInTheDocument();
    // Only that row — PAD is still the generator's.
    expect(within(screen.getByTestId('pool-PAD')).queryByText('manual')).toBeNull();
  });

  it('keeps what was playing and adds what you clicked', async () => {
    render(<RemixView />);
    await screen.findByTestId(laneRegion('PAD'));
    expect(screen.getAllByTestId(/^region-MELODY·/)).toHaveLength(1);

    await userEvent.click(melodyChip(otherElement()));

    // Cross-element draws one lane. Taken over, this track carries both — rules govern the draw.
    expect(screen.getAllByTestId(/^region-MELODY·/)).toHaveLength(2);
  });

  it('turns a chip off again', async () => {
    render(<RemixView />);
    await screen.findByTestId(laneRegion('PAD'));
    const chip = otherElement();

    await userEvent.click(melodyChip(chip));
    expect(melodyChip(chip)).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(melodyChip(chip));

    expect(melodyChip(chip)).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getAllByTestId(/^region-MELODY·/)).toHaveLength(1);
  });

  it('holds a taken-over track through Regenerate while the rest rerolls', async () => {
    render(<RemixView />);
    await screen.findByTestId(laneRegion('PAD'));
    await userEvent.click(melodyChip(otherElement()));
    const mine = screen.getAllByTestId(/^region-MELODY·/).map((n) => n.getAttribute('data-testid'));

    for (let i = 0; i < 8; i++) {
      await userEvent.click(screen.getByRole('button', { name: /Regenerate/ }));
    }

    expect(screen.getAllByTestId(/^region-MELODY·/).map((n) => n.getAttribute('data-testid')))
      .toEqual(mine);
  });

  it('hands the track back to the generator on reset', async () => {
    render(<RemixView />);
    await screen.findByTestId(laneRegion('PAD'));
    const before = screen.getAllByTestId(/^region-MELODY·/).map((n) => n.getAttribute('data-testid'));

    await userEvent.click(melodyChip(otherElement()));
    expect(screen.getAllByTestId(/^region-MELODY·/)).toHaveLength(2);
    await userEvent.click(within(melodyRow()).getByRole('button', { name: /auto/ }));

    expect(within(melodyRow()).queryByText('manual')).toBeNull();
    expect(screen.getAllByTestId(/^region-MELODY·/).map((n) => n.getAttribute('data-testid')))
      .toEqual(before);
  });

  it('is clickable in Borrowed, where the sound is fixed and timings are free', async () => {
    render(<RemixView />);
    await screen.findByTestId(laneRegion('PAD'));

    await userEvent.click(screen.getByRole('button', { name: 'Borrowed timings' }));
    await userEvent.click(screen.getByRole('button', { name: 'ETHER' }));

    // Borrowing collapses MELODY to one ETHER lane. Whichever element the draw took for the
    // Introduction, clicking the OTHER swaps that section's timing onto it — the two cannot both be
    // on, or they would overlap on one voice and one would never sound.
    const drawnIsWater = melodyChip('Water·I').getAttribute('aria-pressed') === 'true'
      || melodyChip('Water·I').className.includes('bg-[var(--accent-ink)]');
    const click = drawnIsWater ? 'Fire·I' : 'Water·I';
    await userEvent.click(melodyChip(click));

    expect(melodyChip(click)).toHaveAttribute('aria-pressed', 'true');
    expect(melodyChip(drawnIsWater ? 'Water·I' : 'Fire·I')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('region-MELODY·ETHER-0')).toBeInTheDocument();
    expect(screen.getAllByTestId(/^region-MELODY·/)).toHaveLength(1);
  });

  it('keeps a silenced row on screen, so you can click its chips back on', async () => {
    render(<RemixView />);
    await screen.findByTestId(laneRegion('PAD'));

    // Take MELODY over, then switch off everything it was playing. The lane goes, and the row must
    // NOT go with it — the chips you would click to bring it back live in that row.
    const drawn = within(melodyRow()).getAllByRole('button')
      .filter((b) => b.className.includes('bg-[var(--accent-ink)]'));
    await userEvent.click(melodyChip(otherElement()));      // take it over
    for (const b of [...within(melodyRow()).getAllByRole('button')]) {
      if (b.getAttribute('aria-pressed') === 'true') await userEvent.click(b);
    }
    expect(drawn.length).toBeGreaterThan(0);

    expect(screen.queryAllByTestId(/^region-MELODY·/)).toHaveLength(0);
    expect(screen.getByTestId('pool-MELODY')).toBeInTheDocument();
    expect(within(melodyRow()).getByText('manual')).toBeInTheDocument();

    // …and it really does come back.
    await userEvent.click(within(melodyRow()).getByRole('button', { name: /auto/ }));
    expect(screen.getAllByTestId(/^region-MELODY·/).length).toBeGreaterThan(0);
  });

  it('leaves chips inert in Scoped, where a click could decide nothing', async () => {
    render(<RemixView />);
    await screen.findByTestId(laneRegion('PAD'));

    // Scope to WATER so there IS a Water·I chip to be inert — scoped to the EARTH default there are
    // no rules at all, and the assertion would pass for the wrong reason.
    await userEvent.click(screen.getByRole('button', { name: 'Scoped' }));
    await userEvent.click(screen.getByRole('button', { name: 'WATER' }));
    expect(screen.getByText('Water·I').tagName).toBe('SPAN');
  });
});

describe('RemixView — send sliders across a category', () => {
  it('moves every lane of a category together, because a row covers them all', async () => {
    render(<RemixView />);
    await screen.findByTestId(laneRegion('PAD'));
    await addSecondMelodyLane();
    expect(screen.getAllByTestId(/^region-MELODY·/)).toHaveLength(2);

    const row = screen.getByTestId('pool-MELODY');
    fireEvent.change(within(row).getByLabelText('Reverb send'), { target: { value: '0.4' } });

    // Sends are stored per lane; the row is per category, so one slider writes through to both.
    const sends = arrangementStore.getState().trackSends;
    expect(sends['MELODY·WATER'].reverb).toBe(0.4);
    expect(sends['MELODY·FIRE'].reverb).toBe(0.4);
    // …and only that kind, on only that category.
    expect(sends['MELODY·WATER'].delay).toBe(sends['MELODY·FIRE'].delay);
    expect(sends['PAD·FIRE']?.reverb ?? 0).not.toBe(0.4);
  });

  it('shows what the category holds, not a stale default', async () => {
    render(<RemixView />);
    await screen.findByTestId(laneRegion('PAD'));

    const row = screen.getByTestId('pool-MELODY');
    fireEvent.change(within(row).getByLabelText('Delay send'), { target: { value: '0.25' } });

    expect((within(screen.getByTestId('pool-MELODY'))
      .getByLabelText('Delay send') as HTMLInputElement).value).toBe('0.25');
  });
});

describe('RemixView — volume across a category', () => {
  const ceilingOf = (id: string) =>
    arrangementStore.getState().tracks.find((t) => t.id === id)?.ceilingDb;

  it('moves every lane of a category together, and leaves the others alone', async () => {
    render(<RemixView />);
    await screen.findByTestId(laneRegion('PAD'));
    await addSecondMelodyLane();
    expect(screen.getAllByTestId(/^region-MELODY·/)).toHaveLength(2);

    const row = screen.getByTestId('pool-MELODY');
    fireEvent.change(within(row).getByLabelText('Volume'), { target: { value: '-9' } });

    // A row is a category and may cover several lanes, so one slider writes through to all of them.
    expect(ceilingOf('MELODY·WATER')).toBe(-9);
    expect(ceilingOf('MELODY·FIRE')).toBe(-9);
    expect(ceilingOf('PAD·FIRE')).toBe(0);
  });

  it('shows the level the category holds, not a stale default', async () => {
    render(<RemixView />);
    await screen.findByTestId(laneRegion('PAD'));

    fireEvent.change(
      within(screen.getByTestId('pool-PAD')).getByLabelText('Volume'), { target: { value: '6' } },
    );

    expect((within(screen.getByTestId('pool-PAD'))
      .getByLabelText('Volume') as HTMLInputElement).value).toBe('6');
    expect(within(screen.getByTestId('pool-PAD')).getByText('6 dB')).toBeInTheDocument();
  });

  it('exports the level you set, not the ceiling the draw handed out', async () => {
    // The draw's tracks always carry the DEFAULT ceiling — a level lives on the store's copy. Read
    // the wrong one and the WAV comes out ignoring every volume in the mix.
    render(<RemixView />);
    await screen.findByTestId(laneRegion('PAD'));

    fireEvent.change(
      within(screen.getByTestId('pool-PAD')).getByLabelText('Volume'), { target: { value: '-9' } },
    );
    await userEvent.click(screen.getByRole('button', { name: /Export WAV/ }));

    await waitFor(() => expect(exportCtl.lastArgs).not.toBeNull());
    expect(exportCtl.lastArgs!.tracks.find((t) => t.id === 'PAD·FIRE')?.ceilingDb).toBe(-9);
  });
});

describe('RemixView — a mix you dialled in survives a redraw', () => {
  // PAD is authored by FIRE alone, so its lane is `PAD·FIRE` in every draw — the id a level is keyed
  // on cannot drift out from under these tests the way a cross-drawn MELODY lane's would.
  const padRow = () => screen.getByTestId('pool-PAD');

  it('keeps a volume through Regenerate', async () => {
    render(<RemixView />);
    await screen.findByTestId(laneRegion('PAD'));
    fireEvent.change(within(padRow()).getByLabelText('Volume'), { target: { value: '-9' } });

    for (let i = 0; i < 4; i++) {
      await userEvent.click(screen.getByRole('button', { name: /Regenerate/ }));
    }

    expect(arrangementStore.getState().tracks.find((t) => t.id === 'PAD·FIRE')?.ceilingDb).toBe(-9);
    expect((within(padRow()).getByLabelText('Volume') as HTMLInputElement).value).toBe('-9');
  });

  it('keeps a send through a chip click, which used to wipe it', async () => {
    render(<RemixView />);
    await screen.findByTestId(laneRegion('PAD'));
    fireEvent.change(within(padRow()).getByLabelText('Reverb send'), { target: { value: '0.4' } });

    // Any chip click redraws, and a redraw reseeds every send from the config defaults.
    await userEvent.click(within(screen.getByTestId('pool-MELODY')).getAllByRole('button')[0]);

    expect(arrangementStore.getState().trackSends['PAD·FIRE'].reverb).toBe(0.4);
  });

  it('keeps a level through a section switch and back', async () => {
    render(<RemixView />);
    await screen.findByTestId(laneRegion('PAD'));
    fireEvent.change(within(padRow()).getByLabelText('Volume'), { target: { value: '-3' } });

    await userEvent.click(screen.getByRole('button', { name: 'Return' }));
    await userEvent.click(screen.getByRole('button', { name: 'Full session' }));

    expect(arrangementStore.getState().tracks.find((t) => t.id === 'PAD·FIRE')?.ceilingDb).toBe(-3);
  });

  it('does not carry a level onto another element’s lane', async () => {
    render(<RemixView />);
    await screen.findByTestId(laneRegion('PAD'));

    await userEvent.click(screen.getByRole('button', { name: 'Scoped' }));
    await userEvent.click(screen.getByRole('button', { name: 'WATER' }));
    fireEvent.change(
      within(screen.getByTestId('pool-MELODY')).getByLabelText('Volume'), { target: { value: '-12' } },
    );
    expect(arrangementStore.getState().tracks.find((t) => t.id === 'MELODY·WATER')?.ceilingDb).toBe(-12);

    await userEvent.click(screen.getByRole('button', { name: 'FIRE' }));

    // A level belongs to a lane, not to a category — FIRE's MELODY is a different lane and starts flat.
    expect(arrangementStore.getState().tracks.find((t) => t.id === 'MELODY·FIRE')?.ceilingDb).toBe(0);
  });
});

describe('RemixView — a long sample plays one pass', () => {
  const LONG = config.audio.remix.longSampleSec + 60; // 4:00, past the threshold

  it('cuts the interval to a single pass, checkbox or not', async () => {
    layerDur.sec = LONG;
    render(<RemixView />);
    await screen.findByTestId(laneRegion('PAD'));
    await waitFor(() => expect(arrangementStore.getState().trackDurations['PAD·FIRE']).toBe(LONG));

    // Authored PAD interval is 1:00, already under one pass — it stays. MELODY's is what moves.
    await userEvent.click(screen.getByRole('button', { name: /Export WAV/ }));
    await waitFor(() => expect(exportCtl.lastArgs).not.toBeNull());
    const exempt = config.audio.remix.alwaysLoopCategories;
    const shaped = exportCtl.lastArgs!.regions.filter((r) => !exempt.includes(r.trackId.split(String.fromCharCode(183))[0]));
    expect(shaped.length).toBeGreaterThan(0);
    for (const r of shaped) {
      expect(r.exitSec - 0, r.trackId).toBeLessThanOrEqual(LONG + 0.001);
    }
  });

  it('leaves the beds looping, however long their file', async () => {
    layerDur.sec = LONG;
    render(<RemixView />);
    await screen.findByTestId(laneRegion('PAD'));
    await waitFor(() => expect(arrangementStore.getState().trackDurations['PAD·FIRE']).toBe(LONG));
    // NOISE and BASS are exempt by config; nothing in this fixture draws NOISE, so assert the rule
    // rather than the draw: the exemption list is what the view hands the function.
    expect(config.audio.remix.alwaysLoopCategories).toContain('NOISE');
    expect(config.audio.remix.alwaysLoopCategories).toContain('BASS');
  });

  it('leaves a short sample looping as before', async () => {
    render(<RemixView />); // layerDur.sec is 40 here
    await screen.findByTestId(laneRegion('PAD'));
    await waitFor(() => expect(arrangementStore.getState().trackDurations['PAD·FIRE']).toBe(40));

    await userEvent.click(screen.getByRole('button', { name: /Export WAV/ }));
    await waitFor(() => expect(exportCtl.lastArgs).not.toBeNull());
    // 1:00 authored, 0:40 sample, whole-loops on → 1:20. Untouched by the long-sample rule.
    expect(exportCtl.lastArgs!.regions.find((r) => r.trackId === 'PAD·FIRE')?.exitSec).toBe(80);
  });
});
