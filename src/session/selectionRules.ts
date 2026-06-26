import type { Category } from '@/types';

// The order tracks appear in, top to bottom.
export const SELECTION_ORDER: Category[] = [
  'ISO', 'PLANET', 'NOISE', 'ELEMENT', 'BASS', 'PAD', 'MELODY', 'FX',
];

const BASE_LABEL: Record<Category, string> = {
  ISO: 'ISO', PLANET: 'PLANETS', NOISE: 'NOISE', ELEMENT: 'ELEMENTS',
  BASS: 'BASS', PAD: 'PAD', MELODY: 'MELODY', FX: 'FX',
};

/** "ISO" for a single track; "PLANETS A"/"PLANETS B" when a category has several. */
export function labelFor(category: Category, index: number, count: number): string {
  const base = BASE_LABEL[category];
  if (count <= 1) return base;
  return `${base} ${String.fromCharCode(65 + index)}`; // A, B, C, ...
}
