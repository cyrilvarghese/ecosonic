import { describe, it, expect } from 'vitest';
import { buildManifest } from '@/session/manifestBuild';

const files = [
  { path: 'WATER/ISO/5hz.wav', bytes: 100 },
  { path: 'WATER/PLANET/EARTH.wav', bytes: 200 },
  { path: 'WATER/PLANET/VENUS.wav', bytes: 200 },
  { path: 'WATER/NOISE/NOISE WATER.wav', bytes: 300 },
  { path: 'WATER/ELEMENT/OCEAN.wav', bytes: 400 },
  { path: 'WATER/ELEMENT/SUB/WHALES.wav', bytes: 500 },        // SUB → ELEMENT_SUB
  { path: 'WATER/DRONE/DRONE WATER.wav', bytes: 550 },         // top-level DRONE folder
  { path: 'WATER/SOUND/BASS/BASS.wav', bytes: 600 },
  { path: 'WATER/SOUND/ARP/ARP.wav', bytes: 700 },             // ARP → recorded only
  { path: 'EARTH/ELEMENT/NATURE.mp3', bytes: 800 },            // mp3 allowed
  { path: 'WATER/.DS_Store', bytes: 1 },                       // cruft
  { path: 'WATER/ISO/._5hz.wav', bytes: 1 },                   // AppleDouble cruft
  { path: 'WATER/SOUND/BASS/notes.txt', bytes: 1 },            // non-audio
];

describe('buildManifest', () => {
  const m = buildManifest(files);

  it('classifies primary categories', () => {
    expect(m.WATER.ISO.map((s) => s.name)).toEqual(['5hz']);
    expect(m.WATER.PLANET).toHaveLength(2);
    expect(m.WATER.NOISE[0].name).toBe('NOISE WATER');
    expect(m.WATER.ELEMENT.map((s) => s.name)).toEqual(['OCEAN']);
    expect(m.WATER.BASS[0].name).toBe('BASS');
  });

  it('records ARP and ELEMENT/SUB separately (not in primary ELEMENT)', () => {
    expect(m.WATER.ELEMENT_SUB.map((s) => s.name)).toEqual(['WHALES']);
    expect(m.WATER.ARP.map((s) => s.name)).toEqual(['ARP']);
  });

  it('classifies the top-level DRONE folder', () => {
    expect(m.WATER.DRONE.map((s) => s.name)).toEqual(['DRONE WATER']);
    expect(m.WATER.ELEMENT.map((s) => s.name)).toEqual(['OCEAN']); // DRONE not folded into ELEMENT
  });

  it('keeps mp3, drops cruft and non-audio', () => {
    expect(m.EARTH.ELEMENT.map((s) => s.name)).toEqual(['NATURE']);
    expect(m.WATER.ISO).toHaveLength(1); // ._5hz.wav excluded
    expect(m.WATER.BASS).toHaveLength(1); // notes.txt excluded
  });
});
