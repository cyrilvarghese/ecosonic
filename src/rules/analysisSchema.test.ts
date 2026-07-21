import { describe, it, expect } from 'vitest';
import {
  AnalysisResultSchema, CandidateRuleSchema, DiscoveredRuleSchema,
  OPENAI_ANALYSIS_JSON_SCHEMA, TextAnalysisSchema, OPENAI_TEXT_ANALYSIS_JSON_SCHEMA,
} from '@/rules/analysisSchema';

export const observationFixture = {
  text: 'A second nature layer enters around 5:00',
  layer: 'ELEMENT' as const,
  sectionIndex: 1,
  structured: {
    category: 'ELEMENT' as const,
    patch: { present: null, enter: { canon: 300, half: 30 }, exit: null, fadeIn: null, fadeOut: null, after: null },
  },
  evidence: [{ atSec: 305, note: 'second water texture becomes audible' }],
  confidence: 0.8,
};
export const resultFixture = {
  description: 'The track opens with a broadband noise floor…',
  sections: [
    { startSec: 0, label: 'build' }, { startSec: 600, label: 'still' }, { startSec: 1200, label: 'return' },
  ],
  observations: [observationFixture],
};

describe('analysisSchema', () => {
  it('accepts a full AnalysisResult fixture', () => {
    expect(AnalysisResultSchema.parse(resultFixture)).toEqual(resultFixture);
  });
  it('coerces an out-of-range present to null instead of failing the whole analysis', () => {
    // The model sometimes emits `present` as seconds (e.g. 75); the schema wants a 0-1 fraction.
    // One bad field must degrade to null, not 502 the entire track.
    const parsed = AnalysisResultSchema.parse({
      ...resultFixture,
      observations: [{
        ...observationFixture,
        structured: {
          category: 'NOISE' as const,
          patch: { present: 75, enter: null, exit: null, fadeIn: null, fadeOut: null, after: null },
        },
      }],
    });
    expect(parsed.observations[0].structured?.patch.present).toBeNull();
  });
  it('rejects confidence out of range and unknown layer', () => {
    expect(AnalysisResultSchema.safeParse({
      ...resultFixture,
      observations: [{ ...observationFixture, confidence: 1.5 }],
    }).success).toBe(false);
    expect(AnalysisResultSchema.safeParse({
      ...resultFixture,
      observations: [{ ...observationFixture, layer: 'KAZOO' }],
    }).success).toBe(false);
  });
  it('CandidateRule extends Observation with kind/relatedRule/mode', () => {
    const cand = { ...observationFixture, kind: 'novel', relatedRule: null, mode: 'INTRODUCTION' };
    expect(CandidateRuleSchema.parse(cand).kind).toBe('novel');
  });
  it('DiscoveredRule requires id/source/status', () => {
    const cand = { ...observationFixture, kind: 'confirms', relatedRule: 'grammar:INTRODUCTION.ELEMENT.enter', mode: 'INTRODUCTION' };
    const disc = { ...cand, id: 'x-1', source: { file: 'a.mp3', date: '2026-07-15T00:00:00.000Z', model: 'gpt-audio-1.5' }, status: 'kept' };
    expect(DiscoveredRuleSchema.parse(disc).status).toBe('kept');
    expect(DiscoveredRuleSchema.safeParse({ ...disc, status: 'archived' }).success).toBe(false);
  });
  it('OpenAI schema is strict-compatible: every object requires all its properties', () => {
    const check = (node: unknown): void => {
      if (typeof node !== 'object' || node === null) return;
      const o = node as Record<string, unknown>;
      if (o.type === 'object') {
        expect(o.additionalProperties).toBe(false);
        expect((o.required as string[]).slice().sort()).toEqual(Object.keys(o.properties as object).sort());
      }
      for (const v of Object.values(o)) {
        if (Array.isArray(v)) v.forEach(check);
        else check(v);
      }
    };
    check(OPENAI_ANALYSIS_JSON_SCHEMA);
  });
});

describe('text analysis schema', () => {
  const window_ = { mode: 'INTRODUCTION' as const, ...resultFixture };
  it('accepts a windows[] payload of per-mode results', () => {
    const parsed = TextAnalysisSchema.parse({ windows: [window_] });
    expect(parsed.windows[0].mode).toBe('INTRODUCTION');
    expect(parsed.windows[0].observations).toHaveLength(1);
  });
  it('rejects an unknown mode', () => {
    expect(TextAnalysisSchema.safeParse({ windows: [{ ...window_, mode: 'CODA' }] }).success).toBe(false);
  });
  it('OpenAI text schema is strict-compatible (all objects require every property)', () => {
    const check = (node: unknown): void => {
      if (typeof node !== 'object' || node === null) return;
      const o = node as Record<string, unknown>;
      if (o.type === 'object') {
        expect(o.additionalProperties).toBe(false);
        expect((o.required as string[]).slice().sort()).toEqual(Object.keys(o.properties as object).sort());
      }
      for (const v of Object.values(o)) { if (Array.isArray(v)) v.forEach(check); else check(v); }
    };
    check(OPENAI_TEXT_ANALYSIS_JSON_SCHEMA);
  });
});
