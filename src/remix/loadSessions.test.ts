import { describe, it, expect } from 'vitest';
import path from 'node:path';
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

  it('round-trips: what it writes, elementFromFilename reads back', () => {
    const name = sessionFilename('Ocean Drift.md', 'ETHER');
    expect(loadSessions(seedDir).store.ETHER).toBeDefined();
    expect(name.startsWith('ether-')).toBe(true);
  });
});
