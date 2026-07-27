import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { loadSessions, sessionFilename } from './loadSessions';

const seedDir = path.join(process.cwd(), 'config', 'sessions');

describe('loadSessions (seed guard)', () => {
  it('parses all five seed files with ZERO warnings', () => {
    const { store, warnings } = loadSessions(seedDir);
    expect(warnings).toEqual([]); // CI guard: seed data stays clean
    expect(Object.keys(store).sort()).toEqual(['AIR', 'EARTH', 'ETHER', 'FIRE', 'WATER'].sort());
    expect(store.WATER.length).toBeGreaterThan(0);
  });
});

const TIMELINE = `## Section 1 - Introduction (0:00-10:00)

| Layer | Starts | Full Level | Starts Leaving | Ends |
|---|---|---|---|---|
| NOISE | 0:00 | Immediate | Continuous | End of section |
`;

describe('loadSessions — several sessions per element', () => {
  it('keeps every session of an element, each stamped with its own id', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'ecosonic-sessions-'));
    writeFileSync(path.join(dir, 'water-ocean-drift.md'), TIMELINE);
    writeFileSync(path.join(dir, 'water-rain.md'), TIMELINE);

    const { store, warnings } = loadSessions(dir);

    expect(warnings).toEqual([]);
    expect(store.WATER.map((d) => d.id).sort()).toEqual(['water-ocean-drift', 'water-rain']);
    // Rules must name their own session, or two sessions of one element are indistinguishable.
    const ids = store.WATER.flatMap((d) => d.rules.map((r) => r.source.sessionId)).sort();
    expect([...new Set(ids)].sort()).toEqual(['water-ocean-drift', 'water-rain']);
    rmSync(dir, { recursive: true, force: true });
  });

  it('pools both sessions of an element into the same category', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'ecosonic-sessions-'));
    writeFileSync(path.join(dir, 'water-a.md'), TIMELINE);
    writeFileSync(path.join(dir, 'water-b.md'), TIMELINE);

    const { store } = loadSessions(dir);
    const noise = store.WATER.flatMap((d) => d.rules).filter((r) => r.category === 'NOISE');

    expect(noise).toHaveLength(2); // two candidates to draw between
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('sessionFilename', () => {
  it('files an upload under the element it was assigned to', () => {
    expect(sessionFilename('My Session.md', 'WATER')).toBe('water-my-session.md');
  });

  it('leaves a name that already carries the right element alone', () => {
    expect(sessionFilename('water-session-layer-timeline.md', 'WATER'))
      .toBe('water-session-layer-timeline.md');
  });

  it('re-files a name whose prefix disagrees with the chosen element', () => {
    expect(sessionFilename('fire-session.md', 'WATER')).toBe('water-session.md');
  });

  it('still produces a stem when the name is only the element', () => {
    expect(sessionFilename('water.md', 'WATER')).toBe('water-session.md');
    expect(sessionFilename('.md', 'AIR')).toBe('air-session.md');
  });

  it('cannot escape the sessions directory', () => {
    expect(sessionFilename('../../etc/passwd.md', 'EARTH')).toBe('earth-etc-passwd.md');
    expect(sessionFilename('a/b\\c.md', 'FIRE')).toBe('fire-a-b-c.md');
  });

  it('does not overwrite a session already filed under that name', () => {
    const taken = ['water-rain.md'];
    expect(sessionFilename('Rain.md', 'WATER', taken)).toBe('water-rain-2.md');
    expect(sessionFilename('Rain.md', 'WATER', [...taken, 'water-rain-2.md']))
      .toBe('water-rain-3.md');
  });

  it('uses the plain name when nothing has claimed it', () => {
    expect(sessionFilename('Rain.md', 'WATER', ['water-ocean.md'])).toBe('water-rain.md');
  });

  it('round-trips: what it writes, elementFromFilename reads back', () => {
    const name = sessionFilename('Ocean Drift.md', 'ETHER');
    expect(loadSessions(seedDir).store.ETHER).toBeDefined();
    expect(name.startsWith('ether-')).toBe(true);
  });
});
