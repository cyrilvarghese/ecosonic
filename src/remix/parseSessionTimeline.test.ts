import { describe, it, expect } from 'vitest';
import { parseSessionTimeline, parseClock } from './parseSessionTimeline';

const md = `# Water Session Layer Timeline

## Section 1 - Introduction (0:00-10:00)

| Layer | Starts | Full Level | Starts Leaving | Ends |
|---|---|---|---|---|
| ISO | ~1:00 | ~2:00 (Fade in) | ~7:00 | ~9:00 (Fade out) |
| NOISE | 0:00 | Immediate | Continuous | End of section |
| SUB MELODY | - | - | - | - |
| THEREMIN | 0:00 | Immediate | - | 5:00 |
`;

describe('parseSessionTimeline', () => {
  it('parses clocks incl. ~approx', () => {
    expect(parseClock('9:30')).toBe(570);
    expect(parseClock('~2:30')).toBe(150);
    expect(parseClock('Immediate')).toBeNull();
  });
  it('resolves a fade-in/out row to one absolute phrase, tagged by section', () => {
    const { rules } = parseSessionTimeline(md, 'WATER');
    const iso = rules.find((r) => r.category === 'ISO')!;
    expect(iso.section).toBe('INTRODUCTION');
    expect(iso.phrases[0]).toEqual({ enterSec: 60, exitSec: 540, fadeInSec: 60, fadeOutSec: 120 });
  });
  it('treats Continuous + End of section as a full-span, no-fade bed', () => {
    const { rules } = parseSessionTimeline(md, 'WATER');
    const noise = rules.find((r) => r.category === 'NOISE')!;
    expect(noise.phrases[0]).toEqual({ enterSec: 0, exitSec: 600, fadeInSec: 0, fadeOutSec: 0 });
  });
  it('skips all-dash rows and warns on unknown layers', () => {
    const { rules, warnings } = parseSessionTimeline(md, 'WATER');
    expect(rules.find((r) => r.variant === 'SUB MELODY')).toBeUndefined(); // all-dash → absent
    expect(warnings.some((w) => w.includes('THEREMIN'))).toBe(true);
  });
  it('skips impossible rows with a warning', () => {
    const bad = `## Section 2 - Deep Relaxation (10:00-20:00)

| Layer | Starts | Full Level | Starts Leaving | Ends |
|---|---|---|---|---|
| NOISE | 19:00 | 20:00 (Fade in) | 9:30 (Fade out) | 10:30 |
`;
    const { rules, warnings } = parseSessionTimeline(bad, 'AIR');
    expect(rules).toHaveLength(0);
    expect(warnings.some((w) => w.includes('start') && w.includes('NOISE'))).toBe(true);
  });
});
