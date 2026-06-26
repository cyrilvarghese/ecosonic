import { describe, it, expect } from 'vitest';
import { normalizeWaveform } from '@/audio/waveform';

describe('normalizeWaveform', () => {
  it('maps 0..255 bytes to -1..1 around the 128 midpoint', () => {
    const out = normalizeWaveform(new Uint8Array([128, 255, 0]));
    expect(out[0]).toBeCloseTo(0, 5);
    expect(out[1]).toBeCloseTo(0.9921875, 5);
    expect(out[2]).toBeCloseTo(-1, 5);
  });
  it('preserves length', () => {
    expect(normalizeWaveform(new Uint8Array(2048))).toHaveLength(2048);
  });
});
