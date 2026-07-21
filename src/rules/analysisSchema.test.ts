import { describe, it, expect } from 'vitest';
import {
  AnalysisResultSchema, CandidateRuleSchema, DiscoveredRuleSchema,
  OPENAI_ANALYSIS_JSON_SCHEMA, extractJsonObject,
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

describe('extractJsonObject', () => {
  const obj = '{"description":"x","sections":[]}';
  it('returns a bare JSON object unchanged', () => {
    expect(extractJsonObject(obj)).toBe(obj);
  });
  it('strips ```json code fences', () => {
    expect(extractJsonObject('```json\n' + obj + '\n```')).toBe(obj);
  });
  it('strips plain ``` fences', () => {
    expect(extractJsonObject('```\n' + obj + '\n```')).toBe(obj);
  });
  it('carves the object out of surrounding prose', () => {
    expect(extractJsonObject('Here is the analysis:\n' + obj + '\nHope that helps!')).toBe(obj);
  });
  it('round-trips through JSON.parse after extraction', () => {
    expect(JSON.parse(extractJsonObject('```json ' + obj + ' ```'))).toEqual({ description: 'x', sections: [] });
  });
});
