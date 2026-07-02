import { describe, it, expect } from 'vitest';
import { normalizeWaveform, amplitudeToY, WAVEFORM_VISUAL_GAIN } from '@/audio/waveform';

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

describe('amplitudeToY', () => {
  const H = 32;
  it('puts silence on the mid-line', () => {
    expect(amplitudeToY(0, H)).toBeCloseTo(H / 2, 5);
  });
  it('boosts quiet signals more than a linear map would', () => {
    // A small amplitude should be pushed well past its raw linear excursion.
    const linear = (H / 2) + 0.05 * (H / 2) * 0.9;
    expect(amplitudeToY(0.05, H)).toBeGreaterThan(linear);
  });
  it('stays within the lane (soft-saturates, never overflows)', () => {
    for (const amp of [-1, -0.7, 0.7, 1, 5, -5]) {
      const y = amplitudeToY(amp, H);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(H);
    }
  });
  it('is symmetric around the center', () => {
    expect(amplitudeToY(0.6, H) - H / 2).toBeCloseTo(-(amplitudeToY(-0.6, H) - H / 2), 5);
  });
  it('exposes a tunable gain constant', () => {
    expect(WAVEFORM_VISUAL_GAIN).toBeGreaterThan(1);
  });
});
