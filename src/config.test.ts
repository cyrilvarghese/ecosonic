import { describe, it, expect } from 'vitest';
import { ConfigSchema, config } from '@/config';

const valid = {
  audio: {
    hybridThresholdBytes: 8388608,
    volume: { minDb: -60, maxDb: 0, defaultTrackDb: -6, defaultMasterDb: 0, muteRampMs: 80, changeRampMs: 200 },
    tuning: { baseHz: 440, defaultHz: 440, presetsHz: [432, 440] },
  },
  selection: {
    ISO: { min: 1, max: 1 }, PLANET: { min: 2, max: 2 }, NOISE: { min: 1, max: 1 },
    ELEMENT: { min: 2, max: 3 }, BASS: { min: 1, max: 1 }, PAD: { min: 1, max: 1 },
    MELODY: { min: 1, max: 1 }, FX: { min: 1, max: 2 },
  },
  motion: { durFastMs: 200, durMs: 400, durSlowMs: 800 },
};

describe('config', () => {
  it('parses a valid config', () => {
    expect(ConfigSchema.parse(valid)).toEqual(valid);
  });
  it('rejects a config missing a required field', () => {
    const bad = { ...valid, audio: { ...valid.audio, volume: { ...valid.audio.volume, minDb: undefined } } };
    expect(ConfigSchema.safeParse(bad).success).toBe(false);
  });
  it('loads the real config file', () => {
    expect(config.selection.ELEMENT.max).toBe(3);
  });
});
