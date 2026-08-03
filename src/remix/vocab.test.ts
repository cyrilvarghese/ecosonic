import { describe, it, expect } from 'vitest';
import { mapLayer } from './vocab';

describe('mapLayer', () => {
  it('maps the beds and drivers 1:1', () => {
    expect(mapLayer('ISO')).toEqual({ category: 'ISO' });
    expect(mapLayer('BASS')).toEqual({ category: 'BASS' });
  });
  it('maps ELEMENTS/SUB ELEMENTS and both PLANET spellings', () => {
    expect(mapLayer('ELEMENTS')).toEqual({ category: 'ELEMENT' });
    expect(mapLayer('SUB ELEMENTS')).toEqual({ category: 'ELEMENT_SUB' });
    expect(mapLayer('PLANET')).toEqual({ category: 'PLANET' });
    expect(mapLayer('PLANETS')).toEqual({ category: 'PLANET' });
  });
  it('maps melody-family variants to MELODY with a variant tag', () => {
    expect(mapLayer('MELODY')).toEqual({ category: 'MELODY' });
    expect(mapLayer('MELODY 2')).toEqual({ category: 'MELODY', variant: 'MELODY 2' });
    expect(mapLayer('SUB MELODY')).toEqual({ category: 'MELODY', variant: 'SUB MELODY' });
    expect(mapLayer('SUB MELODY 2')).toEqual({ category: 'MELODY', variant: 'SUB MELODY 2' });
  });
  it('is case/space tolerant and returns null for unknown', () => {
    expect(mapLayer('  noise ')).toEqual({ category: 'NOISE' });
    expect(mapLayer('THEREMIN')).toBeNull();
  });
});
