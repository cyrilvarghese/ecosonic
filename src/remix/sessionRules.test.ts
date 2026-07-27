import { describe, it, expect } from 'vitest';
import { poolFor, type RuleStore, type AuthoredRule } from './sessionRules';

const rule = (category: AuthoredRule['category'], element: 'WATER' | 'FIRE'): AuthoredRule => ({
  category,
  section: 'INTRODUCTION',
  phrases: [{ enterSec: 0, exitSec: 60, fadeInSec: 0, fadeOutSec: 0 }],
  source: { element, sessionId: `${element}-1`, track: category },
});

describe('poolFor', () => {
  it('collects rules of a category across all elements and sessions', () => {
    const store: RuleStore = {
      WATER: [{ id: 'WATER-1', element: 'WATER', label: 'w', rules: [rule('MELODY', 'WATER'), rule('BASS', 'WATER')] }],
      FIRE: [{ id: 'FIRE-1', element: 'FIRE', label: 'f', rules: [rule('MELODY', 'FIRE')] }],
      EARTH: [], AIR: [], ETHER: [],
    };
    expect(poolFor(store, 'MELODY')).toHaveLength(2);
    expect(poolFor(store, 'BASS')).toHaveLength(1);
    expect(poolFor(store, 'DRONE')).toHaveLength(0); // absent → empty pool
  });
});
