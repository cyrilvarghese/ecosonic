import { z } from 'zod';

/** The 11 layer roles, bottom→top of the stack. Single source for the wire vocabulary. */
export const CATEGORIES = [
  'NOISE', 'ELEMENT', 'ELEMENT_SUB', 'FX', 'ISO', 'PLANET', 'DRONE', 'PAD', 'BASS', 'ARP', 'MELODY',
] as const;
export const MODES = ['INTRODUCTION', 'DEEP_RELAXATION', 'RETURN'] as const;

const CategoryEnum = z.enum(CATEGORIES);
const GenRangeWire = z.object({ canon: z.number().nonnegative(), half: z.number().nonnegative() });
const ExitWire = z.union([GenRangeWire, z.literal('MODULE_END')]);

// Wire optionality is `null`, never absent — OpenAI strict structured outputs require every key.
const PatchWire = z.object({
  present: z.number().min(0).max(1).nullable(),
  enter: GenRangeWire.nullable(),
  exit: ExitWire.nullable(),
  fadeIn: GenRangeWire.nullable(),
  fadeOut: GenRangeWire.nullable(),
  after: CategoryEnum.nullable(),
});
export type PatchWireT = z.infer<typeof PatchWire>;

/** What the MODEL returns — raw, blind observation. No rule references, no classification. */
export const ObservationSchema = z.object({
  text: z.string().min(1),
  layer: CategoryEnum.nullable(),
  sectionIndex: z.number().int().min(1).nullable(), // 1-based; timings in `structured` are section-relative when set
  structured: z.object({ category: CategoryEnum, patch: PatchWire }).nullable(),
  evidence: z.array(z.object({ atSec: z.number().nonnegative(), note: z.string() })),
  confidence: z.number().min(0).max(1),
});
export type Observation = z.infer<typeof ObservationSchema>;

export const AnalysisResultSchema = z.object({
  description: z.string().min(1),
  sections: z.array(z.object({ startSec: z.number().nonnegative(), label: z.string() })).nullable(),
  observations: z.array(ObservationSchema),
});
export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;

/** Observation + LOCAL classification (src/rules/match.ts) — what the UI shows. */
export const CandidateRuleSchema = ObservationSchema.extend({
  kind: z.enum(['confirms', 'contradicts', 'novel']),
  relatedRule: z.string().nullable(), // 'R2' | 'I1' | 'grammar:INTRODUCTION.ISO.enter' | null
  mode: z.enum(MODES).nullable(),
});
export type CandidateRule = z.infer<typeof CandidateRuleSchema>;

/** A kept rule in config/discovered-rules.json. */
export const DiscoveredRuleSchema = CandidateRuleSchema.extend({
  id: z.string().min(1),
  source: z.object({ file: z.string(), date: z.string(), model: z.string() }),
  status: z.enum(['kept', 'promoted']),
});
export type DiscoveredRule = z.infer<typeof DiscoveredRuleSchema>;
export const RegistrySchema = z.array(DiscoveredRuleSchema);

// ---- OpenAI strict response schema (hand-written: strict mode needs additionalProperties:false
// and every property required; zod→JSONSchema emission isn't guaranteed to satisfy that). ----
const jRange = {
  type: 'object', additionalProperties: false,
  properties: { canon: { type: 'number' }, half: { type: 'number' } },
  required: ['canon', 'half'],
} as const;
const jRangeOrNull = { anyOf: [jRange, { type: 'null' }] } as const;
const jCategory = { type: 'string', enum: [...CATEGORIES] } as const;

export const OPENAI_ANALYSIS_JSON_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['description', 'sections', 'observations'],
  properties: {
    description: { type: 'string' },
    sections: {
      anyOf: [
        {
          type: 'array',
          items: {
            type: 'object', additionalProperties: false,
            properties: { startSec: { type: 'number' }, label: { type: 'string' } },
            required: ['startSec', 'label'],
          },
        },
        { type: 'null' },
      ],
    },
    observations: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['text', 'layer', 'sectionIndex', 'structured', 'evidence', 'confidence'],
        properties: {
          text: { type: 'string' },
          layer: { anyOf: [jCategory, { type: 'null' }] },
          sectionIndex: { anyOf: [{ type: 'integer' }, { type: 'null' }] },
          structured: {
            anyOf: [
              {
                type: 'object', additionalProperties: false,
                required: ['category', 'patch'],
                properties: {
                  category: jCategory,
                  patch: {
                    type: 'object', additionalProperties: false,
                    required: ['present', 'enter', 'exit', 'fadeIn', 'fadeOut', 'after'],
                    properties: {
                      present: { anyOf: [{ type: 'number' }, { type: 'null' }] },
                      enter: jRangeOrNull,
                      exit: { anyOf: [jRange, { type: 'string', enum: ['MODULE_END'] }, { type: 'null' }] },
                      fadeIn: jRangeOrNull,
                      fadeOut: jRangeOrNull,
                      after: { anyOf: [jCategory, { type: 'null' }] },
                    },
                  },
                },
              },
              { type: 'null' },
            ],
          },
          evidence: {
            type: 'array',
            items: {
              type: 'object', additionalProperties: false,
              properties: { atSec: { type: 'number' }, note: { type: 'string' } },
              required: ['atSec', 'note'],
            },
          },
          confidence: { type: 'number' },
        },
      },
    },
  },
} as const;
