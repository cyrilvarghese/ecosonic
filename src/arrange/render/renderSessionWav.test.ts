import { describe, it, expect, vi } from 'vitest';
import type { ArrTrack, Mode, TemplateRegion } from '@/arrange/types';
import { config as baseConfig, type EcosonicConfig } from '@/config';

// A tiny config: 4-"second" modules at 1 sample/sec, and a 2-second effect tail. Keeps the
// overlap arithmetic small enough to assert sample by sample. With the real config this would
// allocate ~318 MB per channel.
const HOP = 4;
const TAIL = 2;
const cfg: EcosonicConfig = {
  ...baseConfig,
  layerTwo: { ...baseConfig.layerTwo, moduleSeconds: HOP },
  audio: {
    ...baseConfig.audio,
    effects: {
      ...baseConfig.audio.effects,
      reverb: { ...baseConfig.audio.effects.reverb, seconds: TAIL },
      delay: { ...baseConfig.audio.effects.delay, timeSec: 0.1, feedback: 0 },
    },
  },
};

// Each mode returns HOP + TAIL samples of a per-mode marker, mirroring the real renderer, which
// renders moduleSeconds + tailSec. The last TAIL samples are the part that must overlap.
vi.mock('@/arrange/render/renderModuleWav', () => ({
  renderModuleToChannels: vi.fn(async (args: { regions: { trackId: string }[] }) => {
    const marker = args.regions[0].trackId.charCodeAt(0); // 65/66/67 for A/B/C
    return [Float32Array.from(Array(4 + 2).fill(marker))];
  }),
}));

// Spy on the encoder to capture the mixed channels directly.
const encodeSpy = vi.fn((_channels: Float32Array[], _sampleRate: number) => new ArrayBuffer(8));
vi.mock('@/audio/wavEncode', () => ({
  encodeWavPcm16: (channels: Float32Array[], sampleRate: number) => encodeSpy(channels, sampleRate),
}));

import { renderSessionToWav } from '@/arrange/render/renderSessionWav';

const tracks: ArrTrack[] = [];
const order: Mode[] = ['INTRODUCTION', 'DEEP_RELAXATION', 'RETURN'];
const reg = (id: string): TemplateRegion[] => [{ trackId: id, enterSec: 0, exitSec: 4, fadeInSec: 0, fadeOutSec: 0 }];
const regionsByMode = {
  INTRODUCTION: reg('A'), DEEP_RELAXATION: reg('B'), RETURN: reg('C'),
} as Record<Mode, TemplateRegion[]>;

describe('renderSessionToWav', () => {
  it('overlap-adds each module tail onto the next module, in order', async () => {
    encodeSpy.mockClear();
    const blob = await renderSessionToWav(
      { tracks, regionsByMode, order, masterDb: 0, sampleRate: 1 }, cfg,
    );
    expect(blob.type).toBe('audio/wav');
    const [channels, sr] = encodeSpy.mock.calls[0];
    expect(sr).toBe(1);
    // 3 modules on a 4-sample grid, plus the last module's 2-sample tail.
    expect(channels[0]).toHaveLength(HOP * order.length + TAIL);
    // A at 0..5, B at 4..9, C at 8..13 — the overlaps sum.
    expect([...channels[0]]).toEqual([
      65, 65, 65, 65,   // A alone
      131, 131,         // A tail + B head  (65 + 66)
      66, 66,           // B alone
      133, 133,         // B tail + C head  (66 + 67)
      67, 67,           // C alone
      67, 67,           // C tail, past the grid
    ]);
  });

  it('reports progress ending at 1', async () => {
    const seen: number[] = [];
    await renderSessionToWav(
      { tracks, regionsByMode, order, masterDb: 0, sampleRate: 1, onProgress: (f) => seen.push(f) },
      cfg,
    );
    expect(seen[seen.length - 1]).toBe(1);
  });
});
