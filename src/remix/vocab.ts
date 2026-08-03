import type { Category } from '@/types';

/** Maps an authored layer name (as written in the session-timeline tables) to a code Category,
 *  plus an optional variant tag for melody-family layers. Case- and space-tolerant. */
const EXACT: Record<string, { category: Category; variant?: string }> = {
  ISO: { category: 'ISO' },
  NOISE: { category: 'NOISE' },
  BASS: { category: 'BASS' },
  PAD: { category: 'PAD' },
  ARP: { category: 'ARP' },
  MELODY: { category: 'MELODY' },
  PLANET: { category: 'PLANET' },
  PLANETS: { category: 'PLANET' },
  ELEMENTS: { category: 'ELEMENT' },
  ELEMENT: { category: 'ELEMENT' },
  'SUB ELEMENTS': { category: 'ELEMENT_SUB' },
  'MELODY 2': { category: 'MELODY', variant: 'MELODY 2' },
  'SUB MELODY': { category: 'MELODY', variant: 'SUB MELODY' },
  'SUB MELODY 2': { category: 'MELODY', variant: 'SUB MELODY 2' },
};

export function mapLayer(name: string): { category: Category; variant?: string } | null {
  return EXACT[name.trim().replace(/\s+/g, ' ').toUpperCase()] ?? null;
}
