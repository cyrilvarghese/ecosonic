import { describe, it, expect } from 'vitest';
import { buildModeTemplate } from '@/arrange/buildModeTemplate';
import type { ArrTrack } from '@/arrange/types';
import { config } from '@/config';

const D = config.layerTwo.moduleSeconds;
const t = (id: string, category: ArrTrack['category']): ArrTrack => ({
  id, category, label: id, sample: { name: id, path: id, bytes: 1 }, ceilingDb: 0, locked: false,
});
const tracks: ArrTrack[] = [
  t('n', 'NOISE'), t('i', 'ISO'), t('pad', 'PAD'), t('bass', 'BASS'), t('fx', 'FX'),
];
const byTrack = (tpl: ReturnType<typeof buildModeTemplate>, id: string) =>
  tpl.regions.find((r) => r.trackId === id);

describe('buildModeTemplate', () => {
  it('gives continuous (bed) tracks a full-module region', () => {
    const tpl = buildModeTemplate(tracks, 'RETURN');
    const noise = byTrack(tpl, 'n')!;
    expect(noise.enterSec).toBeCloseTo(0, 6);
    expect(noise.exitSec).toBeCloseTo(D, 6);
  });
  it('omits absent categories (IMMERSION drops BASS/PAD/FX)', () => {
    const tpl = buildModeTemplate(tracks, 'IMMERSION');
    expect(byTrack(tpl, 'pad')).toBeUndefined();
    expect(byTrack(tpl, 'bass')).toBeUndefined();
    expect(byTrack(tpl, 'fx')).toBeUndefined();
    expect(byTrack(tpl, 'n')).toBeDefined(); // bed stays
  });
  it('places sparse regions narrower than active', () => {
    const tpl = buildModeTemplate(tracks, 'RETURN');
    const pad = byTrack(tpl, 'pad')!;   // active
    const widthPad = pad.exitSec - pad.enterSec;
    const relax = buildModeTemplate([t('mel', 'MELODY'), t('n', 'NOISE')], 'RELAXATION');
    const mel = relax.regions.find((r) => r.trackId === 'mel')!; // sparse
    expect(mel.exitSec - mel.enterSec).toBeLessThan(widthPad);
  });
  it('density (overlapping regions) peaks near the module midpoint', () => {
    const tpl = buildModeTemplate(tracks, 'RETURN');
    const count = (s: number) =>
      tpl.regions.filter((r) => s > r.enterSec && s < r.exitSec).length;
    expect(count(D / 2)).toBeGreaterThan(count(D * 0.05));
    expect(count(D / 2)).toBeGreaterThan(count(D * 0.95));
  });
});
