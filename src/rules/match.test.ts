import { describe, it, expect } from 'vitest';
import { classifyObservations } from '@/rules/match';
import type { AnalysisResult, Observation, PatchWireT } from '@/rules/analysisSchema';

const patch = (over: Partial<PatchWireT>): PatchWireT => ({
  present: null, enter: null, exit: null, fadeIn: null, fadeOut: null, after: null, ...over,
});
const obs = (over: Partial<Observation>): Observation => ({
  text: 'x', layer: null, sectionIndex: 1, structured: null,
  evidence: [], confidence: 0.7, ...over,
});
const threeSections = [
  { startSec: 0, label: 'a' }, { startSec: 600, label: 'b' }, { startSec: 1200, label: 'c' },
];
const result = (observations: Observation[], sections: AnalysisResult['sections'] = threeSections): AnalysisResult =>
  ({ description: 'd', sections, observations });

describe('classifyObservations', () => {
  it('confirms a timing within tolerance of the grammar canon', () => {
    // Grammar: INTRODUCTION.ISO.enter = {canon:60, half:20} → tolerance max(30,20)=30.
    const [c] = classifyObservations(result([
      obs({ structured: { category: 'ISO', patch: patch({ enter: { canon: 75, half: 10 } }) } }),
    ]));
    expect(c.kind).toBe('confirms');
    expect(c.relatedRule).toBe('grammar:INTRODUCTION.ISO.enter');
    expect(c.mode).toBe('INTRODUCTION');
  });
  it('contradicts a timing outside tolerance', () => {
    const [c] = classifyObservations(result([
      obs({ structured: { category: 'ISO', patch: patch({ enter: { canon: 200, half: 10 } }) } }),
    ]));
    expect(c.kind).toBe('contradicts');
    expect(c.relatedRule).toBe('grammar:INTRODUCTION.ISO.enter');
  });
  it('is novel when the grammar has no entry for that layer in that mode', () => {
    // DEEP_RELAXATION has no BASS entry (section 2 → DEEP_RELAXATION).
    const [c] = classifyObservations(result([
      obs({ sectionIndex: 2, structured: { category: 'BASS', patch: patch({ enter: { canon: 100, half: 5 } }) } }),
    ]));
    expect(c.kind).toBe('novel');
    expect(c.mode).toBe('DEEP_RELAXATION');
  });
  it('without exactly 3 sections, timing observations are novel with no mode', () => {
    const [c] = classifyObservations(result([
      obs({ structured: { category: 'ISO', patch: patch({ enter: { canon: 60, half: 5 } }) } }),
    ], null));
    expect(c.kind).toBe('novel');
    expect(c.mode).toBeNull();
  });
  it('prose stays novel but gets a topic link', () => {
    const [c] = classifyObservations(result([obs({ text: 'The noise bed never stops' })]));
    expect(c.kind).toBe('novel');
    expect(c.relatedRule).toBe('R7');
  });
  it('synthesizes an R2 contradiction when a higher layer enters before a lower one', () => {
    const cands = classifyObservations(result([
      obs({ structured: { category: 'MELODY', patch: patch({ enter: { canon: 30, half: 5 } }) } }),
      obs({ structured: { category: 'ISO', patch: patch({ enter: { canon: 300, half: 5 } }) } }),
    ]));
    const r2 = cands.find((c) => c.relatedRule === 'R2');
    expect(r2?.kind).toBe('contradicts');
  });
  it('synthesizes an R2 confirmation for >=3 categories entering in stack order', () => {
    const cands = classifyObservations(result([
      obs({ structured: { category: 'ISO', patch: patch({ enter: { canon: 60, half: 5 } }) } }),
      obs({ structured: { category: 'PAD', patch: patch({ enter: { canon: 180, half: 5 } }) } }),
      obs({ structured: { category: 'MELODY', patch: patch({ enter: { canon: 400, half: 5 } }) } }),
    ]));
    const r2 = cands.find((c) => c.relatedRule === 'R2' && c.kind === 'confirms');
    expect(r2).toBeDefined();
  });
});
