import { describe, it, expect } from 'vitest';
import { config } from '@/config';
import manifestJson from '@/manifest.json';
import storeJson from '@/sessionStore.json';
import type { Manifest, ElementName, Category } from '@/types';
import type { RuleStore } from '@/remix/sessionRules';
import { coverageMatrix, planetPairs, sectionWindows, categoryDefaults } from './liveFacts';

const manifest = manifestJson as unknown as Manifest;
const store = (storeJson as unknown as { store: RuleStore }).store;

const row = (category: Category) => coverageMatrix(store, manifest).find((r) => r.category === category)!;
const cell = (category: Category, element: ElementName) =>
  row(category).cells.find((c) => c.element === element)!;

describe('coverageMatrix', () => {
  it('covers every category and every element', () => {
    const m = coverageMatrix(store, manifest);
    expect(m).toHaveLength(11);
    for (const r of m) expect(r.cells).toHaveLength(5);
  });

  it('marks a cell that is authored but ships nothing as dead', () => {
    // ETHER writes an ELEMENT_SUB rule and ships no sample — the one real §3.6 gap.
    const ether = cell('ELEMENT_SUB', 'ETHER');
    expect(ether.rules).toBeGreaterThan(0);
    expect(ether.samples).toBe(0);
    expect(ether.dead).toBe(true);
    expect(ether.sounds).toBe(false);
  });

  it('marks a cell that ships audio no rule reaches as unused', () => {
    // FIRE ships ELEMENT_SUB samples but authors no rule for them.
    const fire = cell('ELEMENT_SUB', 'FIRE');
    expect(fire.samples).toBeGreaterThan(0);
    expect(fire.rules).toBe(0);
    expect(fire.unused).toBe(true);
  });

  it('counts WATER’s restored sub samples, so the panel would have caught the stale manifest', () => {
    const water = cell('ELEMENT_SUB', 'WATER');
    expect(water.samples).toBe(3);
    expect(water.sounds).toBe(true);
  });

  it('reports ELEMENT_SUB as the only category with a dead cell', () => {
    const withDead = coverageMatrix(store, manifest).filter((r) => r.deadCount > 0);
    expect(withDead.map((r) => r.category)).toEqual(['ELEMENT_SUB']);
  });
});

describe('planetPairs', () => {
  it('names both bodies for every element', () => {
    for (const { element, bodies } of planetPairs(manifest)) {
      expect(bodies, element).toHaveLength(2);
    }
  });

  it('reads the real bodies, not a placeholder', () => {
    const earth = planetPairs(manifest).find((p) => p.element === 'EARTH')!;
    expect(earth.bodies).toEqual(['MERCURY', 'SUN']);
  });
});

describe('sectionWindows', () => {
  it('shows AIR opening Deep Relaxation before everyone else', () => {
    const w = sectionWindows(store);
    const air = w.find((e) => e.element === 'AIR')!.starts[1];
    const earth = w.find((e) => e.element === 'EARTH')!.starts[1];
    expect(air).toBe(570); // 9:30
    expect(earth).toBe(600); // 10:00
    expect(air).toBeLessThan(earth!);
  });
});

describe('categoryDefaults', () => {
  it('flags the categories that do not start dry at unity', () => {
    const notable = categoryDefaults(config).filter((d) => d.notable).map((d) => d.category);
    expect(notable).toContain('MELODY'); // starts wet
    expect(notable).toContain('NOISE'); // starts cut
  });

  it('reads NOISE’s cut and MELODY’s wetness from config, not from a copy', () => {
    const byCategory = new Map(categoryDefaults(config).map((d) => [d.category, d]));
    expect(byCategory.get('NOISE')!.db).toBe(config.audio.volume.categoryDb.NOISE);
    expect(byCategory.get('MELODY')!.reverb).toBe(config.audio.effects.defaultSends.MELODY.reverb);
    expect(byCategory.get('PAD')!.db).toBe(config.audio.volume.defaultTrackDb);
  });
});
