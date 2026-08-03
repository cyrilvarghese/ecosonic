import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { loadSessions } from './loadSessions';
import { ruleKey, slotKey, slotKeyFor } from './pins';
import type { AuthoredRule } from './sessionRules';

const pool: AuthoredRule[] = Object.values(
  loadSessions(path.join(process.cwd(), 'config', 'sessions')).store,
).flatMap((docs) => docs.flatMap((d) => d.rules));

describe('ruleKey', () => {
  it('has something to check', () => {
    expect(pool.length).toBeGreaterThan(50); // guard the guard: an empty pool proves nothing
  });

  it('is unique across the whole shipped pool', () => {
    // A pin is a ruleKey. Two rules sharing one would be indistinguishable to it, and pinning either
    // would silently address the other. §2.4 merges repeated rows for one layer within a section,
    // and source.track keeps `MELODY 2` apart from `SUB MELODY` — this asserts that actually holds.
    const seen = new Map<string, AuthoredRule[]>();
    for (const r of pool) {
      const k = ruleKey(r);
      seen.set(k, [...(seen.get(k) ?? []), r]);
    }
    const collisions = [...seen.entries()]
      .filter(([, rs]) => rs.length > 1)
      .map(([k, rs]) => `${k} ×${rs.length}`);
    expect(collisions).toEqual([]);
  });

  it('survives a rebuild of the rule objects, which object identity does not', () => {
    // refetch() reparses the store, so every rule is a new object. A pin held by reference dies
    // there; a pin held by content does not.
    const rebuilt = pool.map((r) => structuredClone(r));
    expect(rebuilt.map(ruleKey)).toEqual(pool.map(ruleKey));
    expect(rebuilt[0]).not.toBe(pool[0]);
  });
});

describe('slotKey', () => {
  it('names the lane and the section a pin fills', () => {
    const r = pool.find((x) => x.category === 'NOISE')!;
    expect(slotKey(r)).toBe(`NOISE|${r.source.element}|${r.section}`);
    expect(slotKeyFor(r.category, r.source.element, r.section)).toBe(slotKey(r));
  });

  it('is deliberately NOT unique — a slot is what several candidates compete for', () => {
    // Several rules of one element+section+category is the normal case; choosing between them is
    // exactly what a pin does. If this ever became unique, pinning would have nothing to decide.
    const counts = new Map<string, number>();
    for (const r of pool) counts.set(slotKey(r), (counts.get(slotKey(r)) ?? 0) + 1);
    expect([...counts.values()].some((n) => n > 1)).toBe(true);
  });
});
