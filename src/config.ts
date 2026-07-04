import { z } from 'zod';
import raw from '../config/ecosonic.config.json';

const Count = z.object({
  min: z.number().int().min(0),
  max: z.number().int().min(0),
});

// Each layer's timing within a module (seconds). `null` = the category is absent in that mode.
const Timing = z.object({
  enter: z.number().nonnegative(),
  exit: z.number().nonnegative(),
  fadeIn: z.number().nonnegative(),
  fadeOut: z.number().nonnegative(),
});
const ModeRule = z.object({
  NOISE: Timing.nullable(), ISO: Timing.nullable(), PLANET: Timing.nullable(), ELEMENT: Timing.nullable(),
  BASS: Timing.nullable(), PAD: Timing.nullable(), MELODY: Timing.nullable(), FX: Timing.nullable(),
});
const LayerTwo = z.object({
  moduleSeconds: z.number().positive(),
  bridgeSeconds: z.number().nonnegative(),
  regionFadeSeconds: z.number().nonnegative(),
  peakFrac: z.number().min(0).max(1),
  schedulerTickMs: z.number().positive(),
  durationPresetsMin: z.array(z.number().positive()),
  modes: z.array(z.enum(['INTRODUCTION', 'DEEP_RELAXATION', 'RETURN'])),
  modeRules: z.object({ INTRODUCTION: ModeRule, DEEP_RELAXATION: ModeRule, RETURN: ModeRule }),
});

export const ConfigSchema = z.object({
  audio: z.object({
    hybridThresholdBytes: z.number().int().positive(),
    volume: z.object({
      minDb: z.number(),
      maxDb: z.number(),
      // Per-track slider range: a boost/cut span centered on 0 dB (unity). Separate
      // from minDb/maxDb, which stay the master range and the silence floor.
      trackMinDb: z.number(),
      trackMaxDb: z.number(),
      defaultTrackDb: z.number(),
      defaultMasterDb: z.number(),
      muteRampMs: z.number().nonnegative(),
      changeRampMs: z.number().nonnegative(),
    }),
    tuning: z.object({
      baseHz: z.number().positive(),
      defaultHz: z.number().positive(),
      presetsHz: z.array(z.number().positive()),
    }),
  }),
  selection: z.object({
    ISO: Count, PLANET: Count, NOISE: Count, ELEMENT: Count,
    BASS: Count, PAD: Count, MELODY: Count, FX: Count,
  }),
  motion: z.object({
    durFastMs: z.number(),
    durMs: z.number(),
    durSlowMs: z.number(),
  }),
  layerTwo: LayerTwo,
});

export type EcosonicConfig = z.infer<typeof ConfigSchema>;

// Validates at import time — a malformed config throws loudly at startup.
export const config: EcosonicConfig = ConfigSchema.parse(raw);
