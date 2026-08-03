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

  it('expands a comma phrase-list into multiple phrases (fades on outer edges)', () => {
    const m = `## Section 1 - Introduction (0:00-10:00)

| Layer | Starts | Full Level | Starts Leaving | Ends |
|---|---|---|---|---|
| MELODY | 2:45-4:33, 5:27-7:15 | Immediate | End of each phrase | 7:15 |
`;
    const { rules } = parseSessionTimeline(m, 'AIR');
    const mel = rules.find((r) => r.category === 'MELODY')!;
    expect(mel.phrases.map((p) => [p.enterSec, p.exitSec])).toEqual([[165, 273], [327, 435]]);
  });

  it('stamps every rule with the session it came from', () => {
    const { rules } = parseSessionTimeline(md, 'WATER', 'water-ocean-drift');
    expect(rules.length).toBeGreaterThan(0);
    expect(rules.every((r) => r.source.sessionId === 'water-ocean-drift')).toBe(true);
  });

  it('falls back to the element when no session id is given', () => {
    const { rules } = parseSessionTimeline(md, 'WATER');
    expect(rules[0].source.sessionId).toBe('WATER');
  });

  it('records the section window start each rule was authored in', () => {
    const air = `## Section 2 - Deep Relaxation (9:30-19:00)

| Layer | Starts | Full Level | Starts Leaving | Ends |
|---|---|---|---|---|
| NOISE | 9:30 | Immediate | Continuous | End of section |
`;
    const earth = `## Section 2 - Deep Relaxation (10:00-20:00)

| Layer | Starts | Full Level | Starts Leaving | Ends |
|---|---|---|---|---|
| NOISE | 10:00 | Immediate | Continuous | End of section |
`;
    expect(parseSessionTimeline(air, 'AIR').rules[0].sectionStartSec).toBe(570);
    expect(parseSessionTimeline(earth, 'EARTH').rules[0].sectionStartSec).toBe(600);
  });

  it('starts the Introduction window at zero', () => {
    const { rules } = parseSessionTimeline(md, 'WATER');
    expect(rules.every((r) => r.sectionStartSec === 0)).toBe(true);
  });

  it('merges two rows of one layer in a section into one rule with per-phrase fades', () => {
    const m = `## Section 2 - Deep Relaxation (10:00-20:00)

| Layer | Starts | Full Level | Starts Leaving | Ends |
|---|---|---|---|---|
| ELEMENTS | 10:00 | Immediate | 10:00 | 12:00 |
| ELEMENTS | 19:00 | 20:00 (Fade in) | - | 20:00 |
`;
    const { rules } = parseSessionTimeline(m, 'FIRE');
    const el = rules.filter((r) => r.category === 'ELEMENT');
    expect(el).toHaveLength(1);
    expect(el[0].phrases).toEqual([
      { enterSec: 600, exitSec: 720, fadeInSec: 0, fadeOutSec: 120 },
      { enterSec: 1140, exitSec: 1200, fadeInSec: 60, fadeOutSec: 0 },
    ]);
  });
});
