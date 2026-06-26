import { z } from 'zod';
import raw from '../config/ecosonic.config.json';

const Count = z.object({
  min: z.number().int().min(0),
  max: z.number().int().min(0),
});

export const ConfigSchema = z.object({
  audio: z.object({
    hybridThresholdBytes: z.number().int().positive(),
    volume: z.object({
      minDb: z.number(),
      maxDb: z.number(),
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
});

export type EcosonicConfig = z.infer<typeof ConfigSchema>;

// Validates at import time — a malformed config throws loudly at startup.
export const config: EcosonicConfig = ConfigSchema.parse(raw);
