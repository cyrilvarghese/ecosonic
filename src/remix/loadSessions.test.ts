import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { loadSessions } from './loadSessions';

const seedDir = path.join(process.cwd(), 'config', 'sessions');

describe('loadSessions (seed guard)', () => {
  it('parses all five seed files with ZERO warnings', () => {
    const { store, warnings } = loadSessions(seedDir);
    expect(warnings).toEqual([]); // CI guard: seed data stays clean
    expect(Object.keys(store).sort()).toEqual(['AIR', 'EARTH', 'ETHER', 'FIRE', 'WATER'].sort());
    expect(store.WATER.length).toBeGreaterThan(0);
  });
});
