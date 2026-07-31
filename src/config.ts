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
  NOISE: Timing.nullable(), ISO: Timing.nullable(), PLANET: Timing.nullable(),
  ELEMENT: Timing.nullable(), ELEMENT_SUB: Timing.nullable(),
  BASS: Timing.nullable(), PAD: Timing.nullable(), DRONE: Timing.nullable(),
  ARP: Timing.nullable(), MELODY: Timing.nullable(), FX: Timing.nullable(),
});
const CATEGORY_VALUES = [
  'NOISE', 'ISO', 'PLANET', 'ELEMENT', 'ELEMENT_SUB', 'BASS', 'PAD', 'DRONE', 'ARP', 'MELODY', 'FX',
] as const;

// A generation range: draw a value from `canon ± half × driftScale`.
const GenRangeSchema = z.object({
  canon: z.number().nonnegative(),
  half: z.number().nonnegative(),
});
const ExitSpecSchema = z.union([GenRangeSchema, z.literal('MODULE_END')]);
// A layer's generative spec within a mode: presence + drawable timing ranges + ordering hint.
const GenLayerRuleSchema = z.object({
  present: z.number().min(0).max(1),
  enter: GenRangeSchema,
  exit: ExitSpecSchema,
  fadeIn: GenRangeSchema,
  fadeOut: GenRangeSchema,
  after: z.enum(CATEGORY_VALUES).optional(),
});
// Every category optional — an omitted key = the layer is absent in that mode.
const GenModeRuleSchema = z.object({
  NOISE: GenLayerRuleSchema.optional(), ISO: GenLayerRuleSchema.optional(),
  PLANET: GenLayerRuleSchema.optional(), ELEMENT: GenLayerRuleSchema.optional(),
  ELEMENT_SUB: GenLayerRuleSchema.optional(), BASS: GenLayerRuleSchema.optional(),
  PAD: GenLayerRuleSchema.optional(), DRONE: GenLayerRuleSchema.optional(),
  ARP: GenLayerRuleSchema.optional(), MELODY: GenLayerRuleSchema.optional(),
  FX: GenLayerRuleSchema.optional(),
});
const GenerationSchema = z.object({
  minGapSec: z.number().nonnegative(),
  driftScales: z.object({
    STRICT: z.number().nonnegative(),
    MODERATE: z.number().nonnegative(),
    EXPLORATORY: z.number().nonnegative(),
  }),
  modeRules: z.object({
    INTRODUCTION: GenModeRuleSchema,
    DEEP_RELAXATION: GenModeRuleSchema,
    RETURN: GenModeRuleSchema,
  }),
});

export type GenRange = z.infer<typeof GenRangeSchema>;
export type GenLayerRule = z.infer<typeof GenLayerRuleSchema>;
export type GenModeRule = z.infer<typeof GenModeRuleSchema>;

const LayerTwo = z.object({
  moduleSeconds: z.number().positive(),
  bridgeSeconds: z.number().nonnegative(),
  regionFadeSeconds: z.number().nonnegative(),
  secondElementEnterSec: z.number().nonnegative(), // a 2nd Element/Sub-Element enters this late
  peakFrac: z.number().min(0).max(1),
  schedulerTickMs: z.number().positive(),
  durationPresetsMin: z.array(z.number().positive()),
  modes: z.array(z.enum(['INTRODUCTION', 'DEEP_RELAXATION', 'RETURN'])),
  modeRules: z.object({ INTRODUCTION: ModeRule, DEEP_RELAXATION: ModeRule, RETURN: ModeRule }),
  generation: GenerationSchema,
});

const SendsSchema = z.object({
  reverb: z.number().min(0).max(1),
  delay: z.number().min(0).max(1),
});
// Per-track aux sends. `defaultSends` is keyed by Category; an unlisted category is fully dry.
const EffectsSchema = z.object({
  reverb: z.object({
    seconds: z.number().positive(),
    decay: z.number().positive(),
    preDelayMs: z.number().nonnegative(),
    seed: z.number().int(),
  }),
  delay: z.object({
    timeSec: z.number().positive(),
    // Below 1 always: at >= 1 the repeats never decay and the tail is a runaway.
    feedback: z.number().min(0).max(0.95),
    dampHz: z.number().positive(),
    maxTimeSec: z.number().positive(),
  }),
  defaultSends: z.record(z.string(), SendsSchema),
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
    effects: EffectsSchema,
  }),
  selection: z.object({
    ISO: Count, PLANET: Count, NOISE: Count, ELEMENT: Count, ELEMENT_SUB: Count,
    BASS: Count, PAD: Count, DRONE: Count, ARP: Count, MELODY: Count, FX: Count,
  }),
  motion: z.object({
    durFastMs: z.number(),
    durMs: z.number(),
    durSlowMs: z.number(),
  }),
  // Track analysis (rule discovery): OpenAI audio model + upload ceiling (~25 MB API limit).
  analysis: z.object({
    model: z.string().min(1),
    textModel: z.string().min(1),
    maxUploadBytes: z.number().int().positive(),
  }),
  layerTwo: LayerTwo,
});

export type EcosonicConfig = z.infer<typeof ConfigSchema>;

// Validates at import time — a malformed config throws loudly at startup.
export const config: EcosonicConfig = ConfigSchema.parse(raw);
