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
    ELEMENT: { min: 2, max: 3 }, ELEMENT_SUB: { min: 1, max: 2 },
    BASS: { min: 1, max: 1 }, PAD: { min: 1, max: 1 }, DRONE: { min: 1, max: 1 },
    ARP: { min: 1, max: 1 }, MELODY: { min: 1, max: 1 }, FX: { min: 1, max: 2 },
  },
  motion: { durFastMs: 200, durMs: 400, durSlowMs: 800 },
  analysis: { model: 'gpt-audio-1.5', textModel: 'gpt-5.6-luna', maxUploadBytes: 26214400 },
  layerTwo: {
    moduleSeconds: 600, bridgeSeconds: 120, regionFadeSeconds: 12, secondElementEnterSec: 300,
    peakFrac: 0.5, schedulerTickMs: 250, durationPresetsMin: [10, 20, 30, 40],
    modes: ['INTRODUCTION', 'DEEP_RELAXATION', 'RETURN'],
    modeRules: {
      INTRODUCTION: {
        NOISE: { enter: 0, exit: 600, fadeIn: 60, fadeOut: 0 },
        ELEMENT: { enter: 0, exit: 600, fadeIn: 30, fadeOut: 60 }, ELEMENT_SUB: null,
        FX: { enter: 0, exit: 600, fadeIn: 30, fadeOut: 60 },
        ISO: { enter: 60, exit: 540, fadeIn: 60, fadeOut: 120 },
        PLANET: { enter: 120, exit: 540, fadeIn: 60, fadeOut: 120 },
        PAD: { enter: 180, exit: 540, fadeIn: 60, fadeOut: 60 },
        DRONE: { enter: 180, exit: 540, fadeIn: 60, fadeOut: 60 },
        BASS: { enter: 240, exit: 540, fadeIn: 0, fadeOut: 60 },
        ARP: { enter: 270, exit: 540, fadeIn: 60, fadeOut: 60 },
        MELODY: { enter: 390, exit: 540, fadeIn: 60, fadeOut: 60 },
      },
      DEEP_RELAXATION: {
        NOISE: { enter: 0, exit: 480, fadeIn: 60, fadeOut: 60 },
        ELEMENT: { enter: 0, exit: 600, fadeIn: 60, fadeOut: 60 },
        ELEMENT_SUB: { enter: 0, exit: 600, fadeIn: 60, fadeOut: 60 },
        ISO: { enter: 0, exit: 480, fadeIn: 60, fadeOut: 60 },
        PLANET: { enter: 0, exit: 480, fadeIn: 60, fadeOut: 60 },
        PAD: null, DRONE: null, BASS: null, ARP: null, MELODY: null, FX: null,
      },
      RETURN: {
        NOISE: { enter: 0, exit: 600, fadeIn: 60, fadeOut: 60 },
        ELEMENT: { enter: 0, exit: 600, fadeIn: 30, fadeOut: 60 }, ELEMENT_SUB: null,
        FX: { enter: 0, exit: 600, fadeIn: 30, fadeOut: 60 },
        ISO: { enter: 60, exit: 600, fadeIn: 60, fadeOut: 60 },
        PLANET: { enter: 120, exit: 600, fadeIn: 60, fadeOut: 60 },
        PAD: { enter: 180, exit: 570, fadeIn: 60, fadeOut: 60 },
        DRONE: { enter: 180, exit: 570, fadeIn: 60, fadeOut: 60 },
        BASS: { enter: 240, exit: 570, fadeIn: 0, fadeOut: 60 },
        ARP: { enter: 270, exit: 570, fadeIn: 60, fadeOut: 60 },
        MELODY: { enter: 390, exit: 570, fadeIn: 60, fadeOut: 60 },
      },
    },
    generation: {
      minGapSec: 20,
      driftScales: { STRICT: 0.15, MODERATE: 0.5, EXPLORATORY: 1.0 },
      modeRules: {
        INTRODUCTION: {
          NOISE: { present: 1, enter: { canon: 0, half: 0 }, exit: 'MODULE_END', fadeIn: { canon: 60, half: 0 }, fadeOut: { canon: 0, half: 0 } },
          ISO: { present: 1, enter: { canon: 60, half: 20 }, exit: { canon: 540, half: 30 }, fadeIn: { canon: 60, half: 15 }, fadeOut: { canon: 120, half: 20 }, after: 'ELEMENT' },
        },
        DEEP_RELAXATION: {
          NOISE: { present: 1, enter: { canon: 0, half: 0 }, exit: { canon: 480, half: 30 }, fadeIn: { canon: 60, half: 15 }, fadeOut: { canon: 60, half: 15 } },
        },
        RETURN: {
          NOISE: { present: 1, enter: { canon: 0, half: 0 }, exit: 'MODULE_END', fadeIn: { canon: 60, half: 15 }, fadeOut: { canon: 60, half: 15 } },
        },
      },
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
  it('rejects a layerTwo config with a bad timing value', () => {
    const bad = {
      ...valid,
      layerTwo: {
        ...valid.layerTwo,
        modeRules: { ...valid.layerTwo.modeRules,
          INTRODUCTION: { ...valid.layerTwo.modeRules.INTRODUCTION, NOISE: 'loud' } },
      },
    };
    expect(ConfigSchema.safeParse(bad).success).toBe(false);
  });
  it('parses the generation block and exposes drift scales', () => {
    expect(config.layerTwo.generation.driftScales.MODERATE).toBe(0.5);
    expect(config.layerTwo.generation.modeRules.INTRODUCTION.ISO?.after).toBe('ELEMENT');
    expect(config.layerTwo.generation.modeRules.DEEP_RELAXATION.BASS).toBeUndefined();
  });
  it('rejects a generation layer rule with present > 1', () => {
    const bad = JSON.parse(JSON.stringify(valid));
    bad.layerTwo.generation.modeRules.INTRODUCTION.NOISE.present = 2;
    expect(ConfigSchema.safeParse(bad).success).toBe(false);
  });
  it('parses the analysis block', () => {
    expect(config.analysis.model).toBe('gpt-audio-1.5');
    expect(config.analysis.textModel).toBe('gpt-5.6-luna');
    expect(config.analysis.maxUploadBytes).toBe(26214400);
  });
  it('rejects a non-positive maxUploadBytes', () => {
    const bad = JSON.parse(JSON.stringify(valid));
    bad.analysis.maxUploadBytes = 0;
    expect(ConfigSchema.safeParse(bad).success).toBe(false);
  });
});
