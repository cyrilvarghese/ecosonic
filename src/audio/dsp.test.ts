import { describe, it, expect } from 'vitest';
import { dbToGain, clampDb } from '@/audio/dsp';

describe('dbToGain', () => {
  it('0 dB is unity gain', () => {
    expect(dbToGain(0, -60)).toBeCloseTo(1, 5);
  });
  it('-6 dB is ~0.501', () => {
    expect(dbToGain(-6, -60)).toBeCloseTo(0.50119, 4);
  });
  it('at or below the floor is silence', () => {
    expect(dbToGain(-60, -60)).toBe(0);
    expect(dbToGain(-90, -60)).toBe(0);
  });
});

describe('clampDb', () => {
  it('clamps to range', () => {
    expect(clampDb(5, -60, 0)).toBe(0);
    expect(clampDb(-100, -60, 0)).toBe(-60);
    expect(clampDb(-12, -60, 0)).toBe(-12);
  });
});
