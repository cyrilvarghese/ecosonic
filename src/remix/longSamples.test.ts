import { describe, it, expect } from 'vitest';
import { config } from '@/config';
import type { TemplateRegion } from '@/arrange/types';
import { playLongOnce } from './longSamples';

const region = (trackId: string, enterSec: number, exitSec: number, fadeIn = 0, fadeOut = 0): TemplateRegion =>
  ({ trackId, enterSec, exitSec, fadeInSec: fadeIn, fadeOutSec: fadeOut });

const LONG = config.audio.remix.longSampleSec + 60; // 4:00
const SHORT = config.audio.remix.longSampleSec - 60; // 2:00

const run = (
  regions: TemplateRegion[],
  durations: Record<string, number>,
  categories: Record<string, string> = {},
) => playLongOnce(regions, durations, (id) => categories[id], config);

describe('playLongOnce', () => {
  it('cuts a long sample’s interval to a single pass', () => {
    const [out] = run([region('MELODY·EARTH', 0, 600)], { 'MELODY·EARTH': LONG });
    expect(out.exitSec).toBe(LONG);
    expect(out.enterSec).toBe(0); // the start never moves
  });

  it('leaves a short sample looping as authored', () => {
    const [out] = run([region('ARP·FIRE', 0, 600)], { 'ARP·FIRE': SHORT });
    expect(out.exitSec).toBe(600);
  });

  it('exempts the beds, however long their file is', () => {
    const regions = [region('NOISE·WATER', 0, 600), region('BASS·ETHER', 0, 600)];
    const out = run(regions, { 'NOISE·WATER': LONG, 'BASS·ETHER': LONG },
      { 'NOISE·WATER': 'NOISE', 'BASS·ETHER': 'BASS' });
    expect(out.map((r) => r.exitSec)).toEqual([600, 600]);
  });

  it('leaves an interval already shorter than one pass exactly as authored', () => {
    // Nothing to cut — the sample is cut by the interval, which §6.4 accepts.
    const [out] = run([region('PAD·WATER', 0, 120)], { 'PAD·WATER': LONG });
    expect(out.exitSec).toBe(120);
  });

  it('caps fades to the surviving width', () => {
    const [out] = run([region('MELODY·EARTH', 0, 600, 300, 300)], { 'MELODY·EARTH': LONG });
    expect(out.fadeInSec).toBeLessThanOrEqual(out.exitSec - out.enterSec);
    expect(out.fadeOutSec).toBeLessThanOrEqual(out.exitSec - out.enterSec);
  });

  it('does nothing until the engine has reported a length', () => {
    const [out] = run([region('MELODY·EARTH', 0, 600)], {});
    expect(out.exitSec).toBe(600);
  });

  it('keeps a later phrase of the same track on its own start', () => {
    const out = run(
      [region('MELODY·EARTH', 0, 600), region('MELODY·EARTH', 900, 1500)],
      { 'MELODY·EARTH': LONG },
    );
    expect(out.map((r) => [r.enterSec, r.exitSec])).toEqual([[0, LONG], [900, 900 + LONG]]);
  });

  it('does not mutate what it is given', () => {
    const input = [region('MELODY·EARTH', 0, 600)];
    run(input, { 'MELODY·EARTH': LONG });
    expect(input[0].exitSec).toBe(600);
  });
});
