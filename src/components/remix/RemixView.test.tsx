import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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
    triggerTrack = vi.fn();
    releaseTrack = vi.fn();
    clear = vi.fn();
  },
}));

// One renderer mock with a flag the tests flip — more robust than re-importing the module mid-test.
const { exportShouldFail } = vi.hoisted(() => ({ exportShouldFail: { value: false } }));
vi.mock('@/remix/renderFreeMix', () => ({
  exportFreeMixWav: vi.fn(async () => {
    if (exportShouldFail.value) throw new Error('decode failed');
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
  exportShouldFail.value = false;
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

  it('surfaces an export failure instead of failing silently', async () => {
    exportShouldFail.value = true;
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
