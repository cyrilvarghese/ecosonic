import { describe, it, expect } from 'vitest';
import { validateTemplate } from '@/arrange/generate/validateTemplate';
import { generateModeTemplate } from '@/arrange/generate/generateModeTemplate';
import type { ArrTrack, ModeTemplate } from '@/arrange/types';
import { DRIFTS } from '@/arrange/types';
import { config } from '@/config';

const t = (id: string, category: ArrTrack['category']): ArrTrack => ({
  id, category, label: id, sample: { name: id, path: id, bytes: 1 }, ceilingDb: 0, locked: false,
});
const tracks: ArrTrack[] = [
  t('n', 'NOISE'), t('e', 'ELEMENT'), t('iso', 'ISO'), t('pl', 'PLANET'),
  t('pad', 'PAD'), t('bass', 'BASS'), t('arp', 'ARP'), t('mel', 'MELODY'),
];

describe('validateTemplate', () => {
  it('passes every generated template across modes, drifts and seeds', () => {
    for (const mode of config.layerTwo.modes) {
      for (const drift of DRIFTS) {
        for (let s = 0; s < 30; s++) {
          const tpl = generateModeTemplate(tracks, mode, drift, s);
          const res = validateTemplate(tpl, tracks);
          expect(res.ok, `${mode}/${drift}/${s}: ${JSON.stringify(res.violations)}`).toBe(true);
        }
      }
    }
  });
  it('flags an inverted entrance order (I2)', () => {
    const bad: ModeTemplate = {
      mode: 'INTRODUCTION',
      regions: [
        { trackId: 'n', enterSec: 0, exitSec: 600, fadeInSec: 0, fadeOutSec: 0 },
        { trackId: 'iso', enterSec: 300, exitSec: 540, fadeInSec: 30, fadeOutSec: 30 },
        { trackId: 'pl', enterSec: 120, exitSec: 540, fadeInSec: 30, fadeOutSec: 30 }, // before ISO!
      ],
    };
    const res = validateTemplate(bad, tracks);
    expect(res.ok).toBe(false);
    expect(res.violations.some((v) => v.code === 'I2_ORDER')).toBe(true);
  });
  it('flags a missing continuity bed (I1)', () => {
    const bad: ModeTemplate = {
      mode: 'INTRODUCTION',
      regions: [{ trackId: 'pad', enterSec: 180, exitSec: 540, fadeInSec: 30, fadeOutSec: 30 }],
    };
    const res = validateTemplate(bad, tracks);
    expect(res.ok).toBe(false);
    expect(res.violations.some((v) => v.code === 'I1_CONTINUITY')).toBe(true);
  });
  it('flags a driver present in DEEP_RELAXATION (I4)', () => {
    const bad: ModeTemplate = {
      mode: 'DEEP_RELAXATION',
      regions: [
        { trackId: 'n', enterSec: 0, exitSec: 480, fadeInSec: 30, fadeOutSec: 30 },
        { trackId: 'e', enterSec: 0, exitSec: 600, fadeInSec: 30, fadeOutSec: 30 },
        { trackId: 'bass', enterSec: 240, exitSec: 540, fadeInSec: 0, fadeOutSec: 30 }, // forbidden
      ],
    };
    const res = validateTemplate(bad, tracks);
    expect(res.ok).toBe(false);
    expect(res.violations.some((v) => v.code === 'I4_MODE')).toBe(true);
  });
});
