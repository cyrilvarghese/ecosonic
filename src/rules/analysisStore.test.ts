import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readAnalyses, saveAnalysis, getAnalysis, deleteAnalysis } from '@/rules/analysisStore';
import type { SavedAnalysis } from '@/rules/analysisSchema';

const input = (fileName: string): Omit<SavedAnalysis, 'savedAt'> => ({
  fileName, model: 'gpt-audio-1.5',
  windows: [{ mode: 'INTRODUCTION', description: 'd', sections: null, candidates: [] }],
});

let dir: string;
beforeEach(() => { dir = mkdtempSync(path.join(tmpdir(), 'eco-analyses-')); });
const at = (name = 'analyses.json') => path.join(dir, name);

describe('analysisStore', () => {
  it('missing file reads as an empty store', () => {
    expect(readAnalyses(at('does-not-exist.json'))).toEqual([]);
  });
  it('save stamps savedAt and round-trips', () => {
    const saved = saveAnalysis(input('a.mp3'), at());
    expect(new Date(saved.savedAt).getTime()).toBeGreaterThan(0);
    expect(readAnalyses(at())).toEqual([saved]);
  });
  it('save upserts by fileName (same name replaces, count stays 1)', () => {
    saveAnalysis(input('a.mp3'), at());
    saveAnalysis(input('a.mp3'), at());
    saveAnalysis(input('b.mp3'), at());
    const all = readAnalyses(at());
    expect(all).toHaveLength(2);
    expect(all.filter((x) => x.fileName === 'a.mp3')).toHaveLength(1);
  });
  it('getAnalysis hit and miss', () => {
    saveAnalysis(input('a.mp3'), at());
    expect(getAnalysis('a.mp3', at())?.fileName).toBe('a.mp3');
    expect(getAnalysis('nope.mp3', at())).toBeNull();
  });
  it('deleteAnalysis true then false', () => {
    saveAnalysis(input('a.mp3'), at());
    expect(deleteAnalysis('a.mp3', at())).toBe(true);
    expect(deleteAnalysis('a.mp3', at())).toBe(false);
    expect(readAnalyses(at())).toEqual([]);
  });
  it('malformed store throws a clear error', () => {
    writeFileSync(at(), '{"not":"an array"}');
    expect(() => readAnalyses(at())).toThrow(/analyses store/);
  });
});
