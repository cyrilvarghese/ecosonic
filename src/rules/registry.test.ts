import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readRegistry, keepRule, removeRule, setStatus } from '@/rules/registry';
import type { CandidateRule } from '@/rules/analysisSchema';

const candidate: CandidateRule = {
  text: 'A second nature layer enters ~5:00', layer: 'ELEMENT', sectionIndex: 1,
  structured: null, evidence: [{ atSec: 300, note: 'audible' }], confidence: 0.8,
  kind: 'novel', relatedRule: null, mode: 'INTRODUCTION',
};

let file: string;
beforeEach(() => {
  file = path.join(mkdtempSync(path.join(tmpdir(), 'eco-rules-')), 'discovered-rules.json');
  writeFileSync(file, '[]');
});

describe('registry', () => {
  it('keep → read round-trips with id, ISO date, and kept status', () => {
    const kept = keepRule(candidate, { file: 'track.mp3', model: 'gpt-audio-1.5' }, file);
    expect(kept.id.length).toBeGreaterThan(8);
    expect(kept.status).toBe('kept');
    expect(new Date(kept.source.date).getTime()).toBeGreaterThan(0);
    expect(readRegistry(file)).toEqual([kept]);
  });
  it('removeRule deletes by id; false when missing', () => {
    const kept = keepRule(candidate, { file: 't.mp3', model: 'm' }, file);
    expect(removeRule('nope', file)).toBe(false);
    expect(removeRule(kept.id, file)).toBe(true);
    expect(readRegistry(file)).toEqual([]);
  });
  it('setStatus promotes in place', () => {
    const kept = keepRule(candidate, { file: 't.mp3', model: 'm' }, file);
    expect(setStatus(kept.id, 'promoted', file)).toBe(true);
    expect(readRegistry(file)[0].status).toBe('promoted');
  });
  it('malformed registry file throws a clear error', () => {
    writeFileSync(file, '{"not":"an array"}');
    expect(() => readRegistry(file)).toThrow(/discovered-rules/);
  });
  it('writes pretty JSON (git-diff friendly)', () => {
    keepRule(candidate, { file: 't.mp3', model: 'm' }, file);
    expect(readFileSync(file, 'utf8')).toContain('\n  ');
  });
});
