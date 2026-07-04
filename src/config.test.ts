import { describe, it, expect } from 'vitest';
import { ConfigSchema, config } from '@/config';

const valid = {
  audio: {
    hybridThresholdBytes: 8388608,
    volume: { minDb: -60, maxDb: 0, trackMinDb: -20, trackMaxDb: 20, defaultTrackDb: 0, defaultMasterDb: 0, muteRampMs: 80, changeRampMs: 200 },
    tuning: { baseHz: 440, defaultHz: 440, presetsHz: [432, 440] },
  },
  selection: {
    ISO: { min: 1, max: 1 }, PLANET: { min: 2, max: 2 }, NOISE: { min: 1, max: 1 },
    ELEMENT: { min: 2, max: 3 }, BASS: { min: 1, max: 1 }, PAD: { min: 1, max: 1 },
    MELODY: { min: 1, max: 1 }, FX: { min: 1, max: 2 },
  },
  motion: { durFastMs: 200, durMs: 400, durSlowMs: 800 },
  layerTwo: {
    moduleSeconds: 600, bridgeSeconds: 120, regionFadeSeconds: 12, peakFrac: 0.5,
    schedulerTickMs: 250, durationPresetsMin: [10, 20, 30, 40],
    modes: ['RELAXATION', 'IMMERSION', 'RETURN'],
    presenceBands: { continuous: [0, 1], active: [0.18, 0.82], sparse: [0.4, 0.6] },
    modeRules: {
      RELAXATION: { NOISE: 'continuous', ISO: 'active', PLANET: 'active', ELEMENT: 'active', BASS: 'sparse', PAD: 'active', MELODY: 'sparse', FX: 'sparse' },
      IMMERSION:  { NOISE: 'continuous', ISO: 'sparse', PLANET: 'sparse', ELEMENT: 'sparse', BASS: 'absent', PAD: 'absent', MELODY: 'absent', FX: 'absent' },
      RETURN:     { NOISE: 'continuous', ISO: 'active', PLANET: 'active', ELEMENT: 'active', BASS: 'active', PAD: 'active', MELODY: 'sparse', FX: 'active' },
    },
  },
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
  it('rejects a layerTwo config with a bad presence value', () => {
    const bad = {
      ...valid,
      layerTwo: {
        ...valid.layerTwo,
        modeRules: { ...valid.layerTwo.modeRules,
          RELAXATION: { ...valid.layerTwo.modeRules.RELAXATION, NOISE: 'loud' } },
      },
    };
    expect(ConfigSchema.safeParse(bad).success).toBe(false);
  });
});
