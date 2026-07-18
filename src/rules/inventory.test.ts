import { describe, it, expect } from 'vitest';
import { PRINCIPLES, INVARIANTS, LAYER_VOCABULARY, buildSystemPrompt, grammarRows } from '@/rules/inventory';
import { CATEGORIES } from '@/rules/analysisSchema';

describe('inventory', () => {
  it('has 9 principles and 6 invariants with ids', () => {
    expect(PRINCIPLES.map((r) => r.id)).toEqual(['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8', 'R9']);
    expect(INVARIANTS.map((r) => r.id)).toEqual(['I1', 'I2', 'I3', 'I4', 'I5', 'I6']);
  });
  it('defines a sonic description for every category', () => {
    for (const c of CATEGORIES) expect(LAYER_VOCABULARY[c].length).toBeGreaterThan(10);
  });
  it('prompt teaches every layer and the guardrail, and takes no arguments (blind)', () => {
    expect(buildSystemPrompt.length).toBe(0); // zero-arg — cannot receive config
    const p = buildSystemPrompt();
    for (const c of CATEGORIES) expect(p).toContain(c);
    expect(p).toContain('Never claim psychological, therapeutic, or neurological effects');
    expect(p).toContain('sectionIndex');
    // `present` must be explained as a 0-1 fraction so the model doesn't emit seconds.
    expect(p.toLowerCase()).toContain('fraction');
  });
  it('prompt contains no house grammar values or rule texts', () => {
    const p = buildSystemPrompt();
    // Distinctive canonical numbers from the grammar tables must be absent.
    for (const n of ['540', '270', '390', '480', '570']) expect(p).not.toContain(n);
    expect(p).not.toContain('canonical');
    for (const r of [...PRINCIPLES, ...INVARIANTS]) expect(p).not.toContain(r.text.slice(0, 40));
  });
  it('grammarRows serializes the live grammar for the UI', () => {
    const rows = grammarRows();
    expect(rows.some((r) => r.mode === 'INTRODUCTION' && r.category === 'ISO')).toBe(true);
    expect(rows.some((r) => r.category === 'DRONE')).toBe(true);
  });
});
