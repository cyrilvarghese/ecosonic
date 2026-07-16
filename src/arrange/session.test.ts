import { describe, it, expect } from 'vitest';
import { buildSessionModules } from '@/arrange/session';
import { buildModeTemplate } from '@/arrange/buildModeTemplate';
import type { ArrTrack, TemplateRegion } from '@/arrange/types';
import { config } from '@/config';

const t = (id: string, category: ArrTrack['category']): ArrTrack => ({
  id, category, label: id, sample: { name: id, path: id, bytes: 1 }, ceilingDb: 0, locked: false,
});
const tracks = [t('n', 'NOISE'), t('pad', 'PAD')];

describe('buildSessionModules', () => {
  it('orders modes per config and uses on-screen regions only for the active mode', () => {
    const active = config.layerTwo.modes[1]; // DEEP_RELAXATION
    const edited: TemplateRegion[] = [{ trackId: 'n', enterSec: 42, exitSec: 300, fadeInSec: 10, fadeOutSec: 10 }];
    const s = buildSessionModules(tracks, active, edited, config);

    expect(s.order).toEqual(config.layerTwo.modes);
    // active mode: identity — the exact on-screen regions
    expect(s.regionsByMode[active]).toBe(edited);
    // the other two: freshly reseeded from the density table
    for (const m of config.layerTwo.modes) {
      if (m === active) continue;
      expect(s.regionsByMode[m]).toEqual(buildModeTemplate(tracks, m, config).regions);
    }
  });
});
