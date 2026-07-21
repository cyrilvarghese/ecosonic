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
    ]), 'INTRODUCTION');
    expect(c.kind).toBe('confirms');
    expect(c.relatedRule).toBe('grammar:INTRODUCTION.ISO.enter');
    expect(c.mode).toBe('INTRODUCTION');
  });
  it('contradicts a timing outside tolerance', () => {
    const [c] = classifyObservations(result([
      obs({ structured: { category: 'ISO', patch: patch({ enter: { canon: 200, half: 10 } }) } }),
    ]), 'INTRODUCTION');
    expect(c.kind).toBe('contradicts');
    expect(c.relatedRule).toBe('grammar:INTRODUCTION.ISO.enter');
  });
  it('is novel when the grammar has no entry for that layer in that mode', () => {
    // DEEP_RELAXATION has no BASS entry.
    const [c] = classifyObservations(result([
      obs({ structured: { category: 'BASS', patch: patch({ enter: { canon: 100, half: 5 } }) } }),
    ]), 'DEEP_RELAXATION');
    expect(c.kind).toBe('novel');
    expect(c.mode).toBe('DEEP_RELAXATION');
  });
  it('resolves section-relative structured timings to absolute window time', () => {
    // Model sub-sectioned the window (sections at 0/180/360) and gave a section-3 observation with
    // timings relative to that section start → they must resolve to absolute (360 + value).
    const sections = [
      { startSec: 0, label: 'a' }, { startSec: 180, label: 'b' }, { startSec: 360, label: 'c' },
    ];
    const [c] = classifyObservations(result([
      obs({ sectionIndex: 3, structured: { category: 'PLANET', patch: patch({ enter: { canon: 20, half: 5 }, exit: { canon: 150, half: 10 } }) } }),
    ], sections), 'RETURN');
    expect(c.structured?.patch.enter).toEqual({ canon: 380, half: 5 });   // 360 + 20
    expect(c.structured?.patch.exit).toEqual({ canon: 510, half: 10 });   // 360 + 150
  });
  it('leaves durations (fadeIn/fadeOut) unshifted when resolving sections', () => {
    const sections = [
      { startSec: 0, label: 'a' }, { startSec: 180, label: 'b' }, { startSec: 360, label: 'c' },
    ];
    const [c] = classifyObservations(result([
      obs({ sectionIndex: 3, structured: { category: 'PAD', patch: patch({ enter: { canon: 10, half: 2 }, fadeIn: { canon: 30, half: 5 } }) } }),
    ], sections), 'RETURN');
    expect(c.structured?.patch.enter).toEqual({ canon: 370, half: 2 });   // shifted
    expect(c.structured?.patch.fadeIn).toEqual({ canon: 30, half: 5 });   // duration — unchanged
  });
  it('classifies against the passed mode even when the model returned no sections', () => {
    const [c] = classifyObservations(result([
      obs({ structured: { category: 'ISO', patch: patch({ enter: { canon: 60, half: 5 } }) } }),
    ], null), 'INTRODUCTION');
    expect(c.kind).toBe('confirms');
    expect(c.mode).toBe('INTRODUCTION');
  });
  it('prose stays novel but gets a topic link', () => {
    const [c] = classifyObservations(result([obs({ text: 'The noise bed never stops' })]), 'INTRODUCTION');
    expect(c.kind).toBe('novel');
    expect(c.relatedRule).toBe('R7');
  });
  it('synthesizes an R2 contradiction when a higher layer enters before a lower one', () => {
    const cands = classifyObservations(result([
      obs({ structured: { category: 'MELODY', patch: patch({ enter: { canon: 30, half: 5 } }) } }),
      obs({ structured: { category: 'ISO', patch: patch({ enter: { canon: 300, half: 5 } }) } }),
    ]), 'INTRODUCTION');
    const r2 = cands.find((c) => c.relatedRule === 'R2');
    expect(r2?.kind).toBe('contradicts');
  });
  it('synthesizes an R2 confirmation for >=3 categories entering in stack order', () => {
    const cands = classifyObservations(result([
      obs({ structured: { category: 'ISO', patch: patch({ enter: { canon: 60, half: 5 } }) } }),
      obs({ structured: { category: 'PAD', patch: patch({ enter: { canon: 180, half: 5 } }) } }),
      obs({ structured: { category: 'MELODY', patch: patch({ enter: { canon: 400, half: 5 } }) } }),
    ]), 'INTRODUCTION');
    const r2 = cands.find((c) => c.relatedRule === 'R2' && c.kind === 'confirms');
    expect(r2).toBeDefined();
  });
});
