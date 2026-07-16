import { describe, it, expect, vi } from 'vitest';
import type { ArrTrack, Mode, TemplateRegion } from '@/arrange/types';

// Mock the module core: each mode returns one channel of 4 samples, all set to a per-mode
// marker derived from the first region's trackId — so we can assert order + concatenation.
vi.mock('@/arrange/render/renderModuleWav', () => ({
  renderModuleToChannels: vi.fn(async (args: { regions: { trackId: string }[] }) => {
    const marker = args.regions[0].trackId.charCodeAt(0); // 65/66/67 for A/B/C
    return [Float32Array.from([marker, marker, marker, marker])];
  }),
}));

// Spy on the encoder to capture the concatenated channels directly.
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
  it('concatenates modules in order and encodes one blob', async () => {
    encodeSpy.mockClear();
    const blob = await renderSessionToWav({ tracks, regionsByMode, order, masterDb: 0, sampleRate: 44100 });
    expect(blob.type).toBe('audio/wav');
    const [channels, sr] = encodeSpy.mock.calls[0];
    expect(sr).toBe(44100);
    expect(channels[0]).toHaveLength(12); // 3 modules × 4 samples
    expect([...channels[0]]).toEqual([65, 65, 65, 65, 66, 66, 66, 66, 67, 67, 67, 67]); // A,B,C order
  });
  it('reports progress ending at 1', async () => {
    const seen: number[] = [];
    await renderSessionToWav({ tracks, regionsByMode, order, masterDb: 0, onProgress: (f) => seen.push(f) });
    expect(seen[seen.length - 1]).toBe(1);
  });
});
