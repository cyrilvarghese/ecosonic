import { describe, it, expect } from 'vitest';
import { PRINCIPLES, INVARIANTS, LAYER_VOCABULARY, buildSystemPrompt, buildTextPrompt, grammarRows, grammarSpans } from '@/rules/inventory';
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
    // Each window is one section — timings must be absolute from 0:00, no sub-sectioning.
    expect(p).toContain('absolute offset from 0:00');
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
  it('buildTextPrompt is blind, zero-arg, and names the three modes + every layer', () => {
    expect(buildTextPrompt.length).toBe(0); // zero-arg — cannot receive config
    const p = buildTextPrompt();
    for (const m of ['INTRODUCTION', 'DEEP_RELAXATION', 'RETURN']) expect(p).toContain(m);
    for (const c of CATEGORIES) expect(p).toContain(c);
    for (const n of ['540', '270', '390', '480', '570']) expect(p).not.toContain(n);
    expect(p).toContain('Never claim psychological, therapeutic, or neurological effects');
  });
});

describe('grammarSpans', () => {
  it('emits numeric spans covering every mode/layer that grammarRows covers', () => {
    const spans = grammarSpans();
    const rows = grammarRows();
    // Same coverage: one span per row.
    expect(spans.length).toBe(rows.length);
    const iso = spans.find((s) => s.mode === 'INTRODUCTION' && s.category === 'ISO');
    expect(iso).toBeDefined();
    expect(typeof iso!.enterCanon).toBe('number');
    expect(typeof iso!.enterHalf).toBe('number');
    expect(iso!.present).toBeGreaterThanOrEqual(0);
    expect(iso!.present).toBeLessThanOrEqual(1);
  });
  it('preserves MODULE_END exits and normalizes missing `after` to null', () => {
    const spans = grammarSpans();
    // NOISE in INTRODUCTION runs to module end and has no ordering hint.
    const noise = spans.find((s) => s.mode === 'INTRODUCTION' && s.category === 'NOISE');
    expect(noise!.exit).toBe('MODULE_END');
    expect(noise!.after).toBeNull();
    // At least one span carries an `after` string.
    expect(spans.some((s) => typeof s.after === 'string')).toBe(true);
  });
});
