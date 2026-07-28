import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { config } from '@/config';
import { arrangementStore } from '@/arrange/arrangementStore';
import type { RemixState } from './useRemix';
import { useRemix } from './useRemix';

// Every element×category holds one sample named `EL-CAT` — except ETHER's DRONE, left blank so the
// generator's "no sample for the picked rule" path has something to trip on.
const { MANIFEST } = vi.hoisted(() => {
  const CATS = ['ISO', 'PLANET', 'NOISE', 'ELEMENT', 'ELEMENT_SUB', 'BASS', 'PAD', 'DRONE', 'ARP', 'MELODY', 'FX'];
  const m: Record<string, Record<string, unknown[]>> = {};
  for (const el of ['EARTH', 'WATER', 'AIR', 'FIRE', 'ETHER']) {
    m[el] = {};
    for (const c of CATS) {
      m[el][c] = el === 'ETHER' && c === 'DRONE'
        ? []
        : [{ name: `${el}-${c}`, path: `${el}-${c}.wav`, bytes: 1, ext: '.wav' }];
    }
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

// MELODY is authored twice (WATER + FIRE) so cross mode has a real choice; PAD once (FIRE); BASS only
// in RETURN, so a section draw visibly narrows to it.
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

const stubSessions = (body: unknown) =>
  vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => body })));

const elementOf = (s: RemixState, category: string) =>
  s.picks.find((p) => p.track.category === category)?.rule.source.element;

beforeEach(() => {
  stubSessions({ store: STORE, warnings: [] });
  // durationMin must be reset too: seeding a section draw writes the module length into the shared
  // store, and the next test would read 10 min as its session length.
  arrangementStore.setState({ tracks: [], durationMin: 30, durationSec: 600 });
});

describe('useRemix', () => {
  it('draws from the whole pool in cross mode, the default', async () => {
    const { result } = renderHook(() => useRemix());
    await waitFor(() => expect(result.current.tracks).toHaveLength(3));
    expect(result.current.mode).toBe('cross');
    expect(result.current.tracks.map((t) => t.category)).toEqual(['PAD', 'BASS', 'MELODY']);
  });

  it('gives each track the sample of its picked rule element in cross mode', async () => {
    const { result } = renderHook(() => useRemix());
    await waitFor(() => expect(result.current.tracks).toHaveLength(3));
    for (const pick of result.current.picks) {
      expect(pick.track.sample.name).toBe(`${pick.rule.source.element}-${pick.track.category}`);
    }
  });

  it('narrows the pool to one element in scoped mode', async () => {
    const { result } = renderHook(() => useRemix());
    await waitFor(() => expect(result.current.tracks).toHaveLength(3));

    act(() => result.current.setMode('scoped'));
    act(() => result.current.setElement('WATER'));

    expect(result.current.tracks.map((t) => t.category)).toEqual(['MELODY']); // WATER authored no PAD
    expect(elementOf(result.current, 'MELODY')).toBe('WATER');
    expect(result.current.picks[0].poolSize).toBe(1);
  });

  it('seeds arrangementStore with the derived tracks so play and export can reach them', async () => {
    const { result } = renderHook(() => useRemix());
    await waitFor(() => expect(arrangementStore.getState().tracks).toHaveLength(3));
    expect(arrangementStore.getState().tracks).toEqual(result.current.tracks);

    act(() => result.current.setMode('scoped'));
    act(() => result.current.setElement('WATER'));
    await waitFor(() => expect(arrangementStore.getState().tracks).toEqual(result.current.tracks));
    expect(arrangementStore.getState().element).toBe('WATER');
  });

  it('redraws the pick on regenerate', async () => {
    const { result } = renderHook(() => useRemix());
    await waitFor(() => expect(result.current.tracks).toHaveLength(3));
    const first = elementOf(result.current, 'MELODY');

    let redrawn = false;
    for (let i = 0; i < 20 && !redrawn; i++) {
      act(() => result.current.regenerate());
      redrawn = elementOf(result.current, 'MELODY') !== first;
    }
    expect(redrawn).toBe(true);
  });

  it('offers only the candidates the current mode can draw from', async () => {
    const { result } = renderHook(() => useRemix());
    await waitFor(() => expect(result.current.tracks).toHaveLength(3));
    expect(result.current.candidatesFor('MELODY')).toHaveLength(2);

    act(() => result.current.setMode('scoped'));
    act(() => result.current.setElement('WATER'));
    expect(result.current.candidatesFor('MELODY')).toHaveLength(1);
    expect(result.current.candidatesFor('PAD')).toHaveLength(0);
  });

  it('offers only the candidates the current section can draw from', async () => {
    const { result } = renderHook(() => useRemix());
    await waitFor(() => expect(result.current.tracks).toHaveLength(3));
    expect(result.current.candidatesFor('BASS')).toHaveLength(1); // its one RETURN rule

    act(() => result.current.setSection('INTRODUCTION'));

    // BASS was only ever authored in RETURN, so nothing here is drawable.
    expect(result.current.candidatesFor('BASS')).toHaveLength(0);
    expect(result.current.candidatesFor('MELODY')).toHaveLength(2);
  });

  it('surfaces parser warnings and generator warnings together', async () => {
    stubSessions({
      store: { ...STORE, ETHER: [{ id: 'e', element: 'ETHER', label: 'e', rules: [rule('DRONE', 'ETHER')] }] },
      warnings: ['parser: unrecognised line'],
    });
    const { result } = renderHook(() => useRemix());
    await waitFor(() => expect(result.current.warnings).toHaveLength(2));
    expect(result.current.warnings).toContain('parser: unrecognised line');
    expect(result.current.warnings.some((w) => w.includes('DRONE'))).toBe(true);
  });

  it('defaults to the full session and its duration', async () => {
    const { result } = renderHook(() => useRemix());
    await waitFor(() => expect(result.current.tracks).toHaveLength(3));
    expect(result.current.section).toBeNull();
    expect(result.current.totalSec).toBe(1800);
  });

  it('switches to a fixed-length module when a section is picked', async () => {
    const { result } = renderHook(() => useRemix());
    await waitFor(() => expect(result.current.tracks).toHaveLength(3));

    act(() => result.current.setSection('RETURN'));

    expect(result.current.totalSec).toBe(config.layerTwo.moduleSeconds);
    expect(result.current.tracks.map((t) => t.category)).toEqual(['BASS']);
    expect(result.current.regions[0]).toMatchObject({ enterSec: 120, exitSec: 300 }); // 1320/1500 − 1200
  });

  it('restores the full session length after returning from a section', async () => {
    const { result } = renderHook(() => useRemix());
    await waitFor(() => expect(result.current.tracks).toHaveLength(3));

    act(() => result.current.setSection('RETURN'));
    expect(result.current.totalSec).toBe(config.layerTwo.moduleSeconds);

    act(() => result.current.setSection(null));

    // Seeding the section module wrote 10 min into the store; the session length must survive it.
    expect(result.current.totalSec).toBe(1800);
    expect(result.current.tracks).toHaveLength(3);
  });

  it('sizes the store timeline to the draw, so scrubbing spans it before play', async () => {
    const { result } = renderHook(() => useRemix());
    // seek() clamps to durationSec, which otherwise sits at the Layer Two module default.
    await waitFor(() => expect(arrangementStore.getState().durationSec).toBe(1800));

    act(() => result.current.setSection('RETURN'));

    await waitFor(() =>
      expect(arrangementStore.getState().durationSec).toBe(config.layerTwo.moduleSeconds));
  });

  it('never overwrites the store session length with a section module length', async () => {
    const { result } = renderHook(() => useRemix());
    await waitFor(() => expect(arrangementStore.getState().tracks).toHaveLength(3));

    act(() => result.current.setSection('RETURN'));
    await waitFor(() => expect(arrangementStore.getState().durationSec).toBe(600));

    // durationMin means the SESSION length. Writing 10 here is what made a later mount read 10
    // and hand back a ten-minute "full session".
    expect(arrangementStore.getState().durationMin).toBe(30);
  });

  it('still draws a full session on a remount that follows a section draw', async () => {
    const first = renderHook(() => useRemix());
    await waitFor(() => expect(first.result.current.tracks).toHaveLength(3));
    act(() => first.result.current.setSection('RETURN'));
    expect(first.result.current.totalSec).toBe(600);
    first.unmount();

    const second = renderHook(() => useRemix());
    await waitFor(() => expect(second.result.current.tracks).toHaveLength(3));
    expect(second.result.current.totalSec).toBe(1800);
  });
});

describe('useRemix — borrowed timings', () => {
  it('plays one element’s samples while the picks come from anywhere', async () => {
    const { result } = renderHook(() => useRemix());
    await waitFor(() => expect(result.current.tracks).toHaveLength(3));

    act(() => result.current.setMode('borrowed'));
    act(() => result.current.setElement('EARTH'));

    // EARTH authors nothing, yet every track the whole pool covers is still drawn.
    expect(result.current.tracks.map((t) => t.category)).toEqual(['PAD', 'BASS', 'MELODY']);
    expect(result.current.tracks.every((t) => t.sample.name === `EARTH-${t.category}`)).toBe(true);
    expect(result.current.picks.every((p) => p.rule.source.element !== 'EARTH')).toBe(true);
  });

  it('offers every element’s rules as candidates, filtered by section only', async () => {
    const { result } = renderHook(() => useRemix());
    await waitFor(() => expect(result.current.tracks).toHaveLength(3));

    act(() => result.current.setMode('borrowed'));
    act(() => result.current.setElement('EARTH'));

    // Both authored MELODY rules are drawable, so both must be offered.
    expect(result.current.candidatesFor('MELODY').map((r) => r.source.element).sort())
      .toEqual(['FIRE', 'WATER']);

    act(() => result.current.setSection('RETURN'));
    expect(result.current.candidatesFor('MELODY')).toEqual([]);
    expect(result.current.candidatesFor('BASS')).toHaveLength(1);
  });

  it('tells arrangementStore the element you actually hear', async () => {
    const { result } = renderHook(() => useRemix());
    await waitFor(() => expect(result.current.tracks).toHaveLength(3));

    act(() => result.current.setMode('borrowed'));
    act(() => result.current.setElement('AIR'));

    await waitFor(() => expect(arrangementStore.getState().element).toBe('AIR'));
  });

  it('carries the element across a mode switch', async () => {
    const { result } = renderHook(() => useRemix());
    await waitFor(() => expect(result.current.tracks).toHaveLength(3));

    // ETHER authors nothing, so it is the element that tells the modes apart: scoped to it there is
    // no mix at all, borrowed from it there is a full one — and no draw could reach ETHER by chance.
    act(() => result.current.setMode('scoped'));
    act(() => result.current.setElement('ETHER'));
    expect(result.current.tracks).toEqual([]);

    act(() => result.current.setMode('borrowed'));

    expect(result.current.element).toBe('ETHER');
    expect(result.current.tracks.map((t) => t.category)).toEqual(['PAD', 'BASS', 'MELODY']);
    expect(result.current.tracks.every((t) => t.sample.name.startsWith('ETHER-'))).toBe(true);
  });
});
