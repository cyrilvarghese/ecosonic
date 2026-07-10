import { z } from 'zod';
import type { ArrTrack, Drift, Mode, TemplateRegion } from '@/arrange/types';

const RegionSchema = z.object({
  trackId: z.string(),
  enterSec: z.number().nonnegative(),
  exitSec: z.number().nonnegative(),
  fadeInSec: z.number().nonnegative(),
  fadeOutSec: z.number().nonnegative(),
});
const FileSchema = z.object({
  version: z.literal(1),
  kind: z.literal('ecosonic-arrangement'),
  mode: z.enum(['INTRODUCTION', 'DEEP_RELAXATION', 'RETURN']),
  drift: z.enum(['STRICT', 'MODERATE', 'EXPLORATORY']),
  regions: z.array(RegionSchema),
  tracks: z.array(z.object({ id: z.string(), category: z.string(), sampleName: z.string(), samplePath: z.string() })),
});

export type ArrangementFile = z.infer<typeof FileSchema>;

/** Snapshot the current arrangement as a pretty-printed JSON string (spec §6). */
export function serializeArrangement(args: {
  mode: Mode; drift: Drift; regions: TemplateRegion[]; tracks: ArrTrack[];
}): string {
  const file: ArrangementFile = {
    version: 1,
    kind: 'ecosonic-arrangement',
    mode: args.mode,
    drift: args.drift,
    regions: args.regions,
    tracks: args.tracks.map((t) => ({ id: t.id, category: t.category, sampleName: t.sample.name, samplePath: t.sample.path })),
  };
  return JSON.stringify(file, null, 2);
}

/** Parse an exported arrangement; throws (zod/JSON error) on anything malformed. */
export function parseArrangement(json: string): ArrangementFile {
  return FileSchema.parse(JSON.parse(json));
}
