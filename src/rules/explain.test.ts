import { describe, it, expect } from 'vitest';
import { explainRule, rulePhrase } from '@/rules/explain';

describe('explainRule', () => {
  it('grammar timing → verdict + expected absolute time', () => {
    const s = explainRule('grammar:INTRODUCTION.DRONE.exit', 'contradicts');
    expect(s).toContain('Contradicts');
    expect(s).toContain('Introduction');
    expect(s).toContain('DRONE');
    expect(s).toContain('exit');
    expect(s).toContain('9:00');
    expect(s).toContain('±30');
  });
  it('grammar MODULE_END → runs to the end', () => {
    expect(explainRule('grammar:INTRODUCTION.NOISE.exit', 'contradicts')).toContain('run to the end');
  });
  it('grammar fadeIn → a duration in seconds', () => {
    expect(explainRule('grammar:INTRODUCTION.PAD.fadeIn', 'confirms')).toContain('fade in over 60s');
  });
  it('grammar after → follows a category', () => {
    expect(explainRule('grammar:INTRODUCTION.DRONE.after', 'confirms')).toContain('follow PLANET');
  });
  it('principle id → title and text', () => {
    const s = explainRule('R7', 'novel');
    expect(s).toContain('New');
    expect(s).toContain('R7');
    expect(s).toContain('Unbroken continuity');
    expect(s).toContain('Noise never breaks');
  });
  it('null rule → just the verdict word', () => {
    expect(explainRule(null, 'novel')).toBe('New');
  });
});

describe('rulePhrase', () => {
  it('grammar token → the expectation, without a verdict prefix', () => {
    const s = rulePhrase('grammar:RETURN.DRONE.enter');
    expect(s).toContain('Return');
    expect(s).toContain('DRONE');
    expect(s).toContain('enter');
    expect(s).not.toMatch(/^(Contradicts|Confirms|New)/);
  });
  it('principle id → title and text, no verdict prefix', () => {
    expect(rulePhrase('R7')).toBe('R7 Unbroken continuity: Noise never breaks; the bed covers every seam.');
  });
  it('null → null', () => {
    expect(rulePhrase(null)).toBeNull();
  });
});
