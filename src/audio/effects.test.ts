import { describe, expect, it } from 'vitest';
import { config } from '@/config';
import { defaultSendsFor, impulseChannel, tailSecFor } from '@/audio/effects';

describe('impulseChannel', () => {
  it('returns a buffer of the requested length', () => {
    expect(impulseChannel(128, 2, 1)).toHaveLength(128);
  });

  it('is deterministic for a given seed', () => {
    expect(Array.from(impulseChannel(64, 2, 7))).toEqual(Array.from(impulseChannel(64, 2, 7)));
  });

  it('differs between seeds, so the two stereo channels decorrelate', () => {
    expect(Array.from(impulseChannel(64, 2, 1))).not.toEqual(Array.from(impulseChannel(64, 2, 2)));
  });

  it('decays — the tail is quieter than the head', () => {
    const ir = impulseChannel(1000, 2, 1);
    const peak = (from: number, to: number) =>
      Math.max(...Array.from(ir.slice(from, to), Math.abs));
    expect(peak(900, 1000)).toBeLessThan(peak(0, 100));
  });

  it('ends at silence — the final sample is below -80 dBFS', () => {
    const ir = impulseChannel(256, 2, 1);
    expect(Math.abs(ir[255])).toBeLessThan(1e-4);
  });

  it('stays within [-1, 1] so the convolver is not fed a hot buffer', () => {
    for (const v of impulseChannel(512, 2, 3)) expect(Math.abs(v)).toBeLessThanOrEqual(1);
  });
});

describe('tailSecFor', () => {
  const base = config.audio.effects;

  it('uses the reverb when it outlasts the delay', () => {
    const cfg = {
      ...base,
      reverb: { ...base.reverb, seconds: 9 },
      delay: { ...base.delay, timeSec: 0.1, feedback: 0.1 },
    };
    expect(tailSecFor(cfg)).toBe(9);
  });

  it('uses the delay when it outlasts the reverb', () => {
    const cfg = {
      ...base,
      reverb: { ...base.reverb, seconds: 0.5 },
      delay: { ...base.delay, timeSec: 1, feedback: 0.5 },
    };
    // 0.5 feedback reaches -60dB after log(0.001)/log(0.5) ≈ 9.97 repeats of 1s
    expect(tailSecFor(cfg)).toBeCloseTo(9.966, 2);
  });

  it('still allows one repeat at zero feedback', () => {
    const cfg = {
      ...base,
      reverb: { ...base.reverb, seconds: 0.1 },
      delay: { ...base.delay, timeSec: 2, feedback: 0 },
    };
    expect(tailSecFor(cfg)).toBe(2);
  });

  it('clamps runaway feedback rather than returning Infinity', () => {
    const cfg = { ...base, delay: { ...base.delay, timeSec: 1, feedback: 1.5 } };
    expect(Number.isFinite(tailSecFor(cfg))).toBe(true);
  });

  it('is positive for the shipped config', () => {
    expect(tailSecFor(base)).toBeGreaterThan(0);
  });
});

describe('defaultSendsFor', () => {
  const defaults = { MELODY: { reverb: 0.2, delay: 0.12 } };

  it('seeds a listed category from the defaults', () => {
    const out = defaultSendsFor([{ id: 'm', category: 'MELODY' }], defaults);
    expect(out.m).toEqual({ reverb: 0.2, delay: 0.12 });
  });

  it('leaves an unlisted category fully dry', () => {
    const out = defaultSendsFor([{ id: 'b', category: 'BASS' }], defaults);
    expect(out.b).toEqual({ reverb: 0, delay: 0 });
  });

  it('covers every track', () => {
    const out = defaultSendsFor(
      [{ id: 'm', category: 'MELODY' }, { id: 'b', category: 'BASS' }],
      defaults,
    );
    expect(Object.keys(out).sort()).toEqual(['b', 'm']);
  });

  it('ships a non-zero MELODY default, so melody sounds right untouched', () => {
    expect(config.audio.effects.defaultSends.MELODY.reverb).toBeGreaterThan(0);
  });
});
