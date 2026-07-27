import { describe, it, expect } from 'vitest';
import type { TemplateRegion } from '@/arrange/types';
import { adjustToWholeLoops } from './wholeLoops';

const region = (enterSec: number, exitSec: number, trackId = 'ISO', fadeInSec = 0, fadeOutSec = 0): TemplateRegion =>
  ({ trackId, enterSec, exitSec, fadeInSec, fadeOutSec });

const SAMPLE = { ISO: 100 };
const SESSION = 1800;

describe('adjustToWholeLoops', () => {
  it('rounds a 1.7 loop interval up to 2 whole loops', () => {
    const [r] = adjustToWholeLoops([region(0, 170)], SAMPLE, SESSION);
    expect([r.enterSec, r.exitSec]).toEqual([0, 200]);
  });

  it('rounds a 1.49 loop interval down to 1 whole loop', () => {
    const [r] = adjustToWholeLoops([region(0, 149)], SAMPLE, SESSION);
    expect([r.enterSec, r.exitSec]).toEqual([0, 100]);
  });

  it('never rounds away a track — under half a loop still becomes one', () => {
    const [r] = adjustToWholeLoops([region(0, 40)], SAMPLE, SESSION);
    expect([r.enterSec, r.exitSec]).toEqual([0, 100]);
  });

  it('keeps the interval start where the author put it', () => {
    const [r] = adjustToWholeLoops([region(600, 770)], SAMPLE, SESSION);
    expect([r.enterSec, r.exitSec]).toEqual([600, 800]);
  });

  it('leaves an exact multiple alone', () => {
    const [r] = adjustToWholeLoops([region(0, 300)], SAMPLE, SESSION);
    expect([r.enterSec, r.exitSec]).toEqual([0, 300]);
  });

  it('rounds down rather than overrun the end of the session', () => {
    const [r] = adjustToWholeLoops([region(0, 170)], SAMPLE, 180);
    expect(r.exitSec).toBe(100); // 2 loops would need 200s of a 180s session
  });

  it('rounds down rather than overlap the next interval of the same track', () => {
    const [first] = adjustToWholeLoops([region(0, 170), region(150, 400)], SAMPLE, SESSION);
    expect(first.exitSec).toBe(100);
  });

  it('leaves an interval untouched when not even one whole loop fits', () => {
    const [first] = adjustToWholeLoops([region(0, 40), region(60, 400)], SAMPLE, SESSION);
    expect([first.enterSec, first.exitSec]).toEqual([0, 40]);
  });

  it('leaves an interval untouched while its sample length is unknown', () => {
    const [r] = adjustToWholeLoops([region(0, 170, 'PAD')], SAMPLE, SESSION);
    expect([r.enterSec, r.exitSec]).toEqual([0, 170]);
  });

  it('adjusts each track against its own sample length', () => {
    const out = adjustToWholeLoops(
      [region(0, 170, 'ISO'), region(0, 170, 'PAD')],
      { ISO: 100, PAD: 60 },
      SESSION,
    );
    expect(out.find((r) => r.trackId === 'ISO')!.exitSec).toBe(200); // 1.7 → 2 × 100
    expect(out.find((r) => r.trackId === 'PAD')!.exitSec).toBe(180); // 2.83 → 3 × 60
  });

  it('caps a fade that no longer fits the resized interval', () => {
    const [r] = adjustToWholeLoops([region(0, 149, 'ISO', 200, 200)], SAMPLE, SESSION);
    expect([r.fadeInSec, r.fadeOutSec]).toEqual([100, 100]);
  });

  it('preserves the order it was given', () => {
    const out = adjustToWholeLoops([region(600, 770), region(0, 170)], SAMPLE, SESSION);
    expect(out.map((r) => r.enterSec)).toEqual([600, 0]);
  });

  it('does not mutate the regions it was given', () => {
    const input = [region(0, 170)];
    adjustToWholeLoops(input, SAMPLE, SESSION);
    expect(input[0].exitSec).toBe(170);
  });
});
