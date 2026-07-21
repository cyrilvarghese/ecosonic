import { describe, it, expect } from 'vitest';
import { laneItem, ghostBand, ruleFor, partition } from '@/rules/timeline';
import type { CandidateRule, PatchWireT } from '@/rules/analysisSchema';

const patch = (over: Partial<PatchWireT>): PatchWireT => ({
  present: null, enter: null, exit: null, fadeIn: null, fadeOut: null, after: null, ...over,
});
const cand = (over: Partial<CandidateRule>): CandidateRule => ({
  text: 'x', layer: null, sectionIndex: 1, structured: null, evidence: [], confidence: 0.7,
  kind: 'novel', relatedRule: null, mode: 'INTRODUCTION', ...over,
});

describe('laneItem', () => {
  it('enter+exit → a bar', () => {
    const it_ = laneItem(cand({ kind: 'confirms', structured: { category: 'ISO', patch: patch({ enter: { canon: 60, half: 10 }, exit: { canon: 300, half: 20 } }) } }), 600);
    expect(it_).toMatchObject({ category: 'ISO', mark: 'bar', startSec: 60, endSec: 300, kind: 'confirms' });
  });
  it('enter only → a tick (endSec null)', () => {
    const it_ = laneItem(cand({ structured: { category: 'PAD', patch: patch({ enter: { canon: 120, half: 5 } }) } }), 600);
    expect(it_).toMatchObject({ mark: 'tick', startSec: 120, endSec: null });
  });
  it('exit MODULE_END → bar to D', () => {
    const it_ = laneItem(cand({ structured: { category: 'NOISE', patch: patch({ enter: { canon: 0, half: 1 }, exit: 'MODULE_END' }) } }), 600);
    expect(it_).toMatchObject({ mark: 'bar', startSec: 0, endSec: 600 });
  });
  it('no structured / no enter → null', () => {
    expect(laneItem(cand({ text: 'prose' }), 600)).toBeNull();
    expect(laneItem(cand({ structured: { category: 'ISO', patch: patch({}) } }), 600)).toBeNull();
  });
});

describe('ghostBand', () => {
  it('canon→canon from a rule', () => {
    const rule = ruleFor('INTRODUCTION', 'ISO')!;
    const expectedEnd = rule.exit === 'MODULE_END' ? 600 : rule.exit.canon;
    expect(ghostBand(rule, 600)).toEqual({ startSec: rule.enter.canon, endSec: expectedEnd });
  });
  it('missing rule → null (layer absent in that mode)', () => {
    expect(ghostBand(ruleFor('DEEP_RELAXATION', 'BASS'), 600)).toBeNull();
  });
});

describe('partition', () => {
  it('groups by category in stack order and splits untimed', () => {
    const cands = [
      cand({ text: 'prose', kind: 'novel' }),
      cand({ structured: { category: 'MELODY', patch: patch({ enter: { canon: 400, half: 5 } }) } }),
      cand({ structured: { category: 'ISO', patch: patch({ enter: { canon: 60, half: 5 } }) } }),
    ];
    const { lanes, untimed } = partition(cands, 600);
    expect(lanes.map((l) => l.category)).toEqual(['ISO', 'MELODY']); // stack order, not input order
    expect(untimed).toHaveLength(1);
  });
});
