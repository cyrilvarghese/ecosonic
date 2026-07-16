import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, readFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promoteRule } from '@/rules/promote';

const realConfig = path.join(process.cwd(), 'config', 'ecosonic.config.json');
let file: string;
beforeEach(() => {
  file = path.join(mkdtempSync(path.join(tmpdir(), 'eco-cfg-')), 'ecosonic.config.json');
  copyFileSync(realConfig, file);
});
const nullPatch = { present: null, enter: null, exit: null, fadeIn: null, fadeOut: null, after: null };

describe('promoteRule', () => {
  it('merges a partial patch into an existing layer entry', () => {
    const res = promoteRule(
      { mode: 'INTRODUCTION', category: 'ISO', patch: { ...nullPatch, enter: { canon: 90, half: 25 } } },
      file,
    );
    expect(res.ok).toBe(true);
    const cfg = JSON.parse(readFileSync(file, 'utf8'));
    expect(cfg.layerTwo.generation.modeRules.INTRODUCTION.ISO.enter).toEqual({ canon: 90, half: 25 });
    // untouched sibling field survives the merge
    expect(cfg.layerTwo.generation.modeRules.INTRODUCTION.ISO.fadeOut.canon).toBe(120);
  });
  it('inserts a COMPLETE entry into a mode where the layer is absent', () => {
    const res = promoteRule({
      mode: 'DEEP_RELAXATION', category: 'PAD',
      patch: {
        present: 0.5, enter: { canon: 120, half: 30 }, exit: { canon: 480, half: 30 },
        fadeIn: { canon: 60, half: 15 }, fadeOut: { canon: 60, half: 15 }, after: null,
      },
    }, file);
    expect(res.ok).toBe(true);
    const cfg = JSON.parse(readFileSync(file, 'utf8'));
    expect(cfg.layerTwo.generation.modeRules.DEEP_RELAXATION.PAD.present).toBe(0.5);
  });
  it('rejects a partial patch into an absent layer — config byte-identical', () => {
    const before = readFileSync(file, 'utf8');
    const res = promoteRule(
      { mode: 'DEEP_RELAXATION', category: 'PAD', patch: { ...nullPatch, enter: { canon: 120, half: 30 } } },
      file,
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/invalid/i);
    expect(readFileSync(file, 'utf8')).toBe(before);
  });
  it('rejects a patch that fails schema validation — config byte-identical', () => {
    const before = readFileSync(file, 'utf8');
    const res = promoteRule(
      { mode: 'INTRODUCTION', category: 'ISO', patch: { ...nullPatch, present: 2 as never } },
      file,
    );
    expect(res.ok).toBe(false);
    expect(readFileSync(file, 'utf8')).toBe(before);
  });
});
