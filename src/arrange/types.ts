import type { Category } from '@/types';

export type Mode = 'INTRODUCTION' | 'DEEP_RELAXATION' | 'RETURN';

export const BED_CATEGORIES: Category[] = ['NOISE', 'ISO', 'PLANET', 'ELEMENT'];
export const isBed = (c: Category): boolean => BED_CATEGORIES.includes(c);

export type Drift = 'STRICT' | 'MODERATE' | 'EXPLORATORY';
export const DRIFTS: Drift[] = ['STRICT', 'MODERATE', 'EXPLORATORY'];

/** Fixed vertical grammar (bottom → top) from the production brief. Drives entrance ordering. */
export const STACK_ORDER: Category[] = [
  'NOISE', 'ELEMENT', 'ELEMENT_SUB', 'FX', 'ISO', 'PLANET', 'PAD', 'BASS', 'ARP', 'MELODY',
];
export const stackIndex = (c: Category): number => STACK_ORDER.indexOf(c);

export interface ArrTrack {
  id: string;
  category: Category;
  label: string;
  sample: { name: string; path: string; bytes: number };
  ceilingDb: number;
  locked: boolean;
}

/** Minimal timing shape shared by template (module-relative) and absolute regions. */
export interface RegionTiming {
  enterSec: number;
  exitSec: number;
  fadeInSec: number;
  fadeOutSec: number;
}

export interface TemplateRegion extends RegionTiming {
  trackId: string;
}

export interface ModeTemplate {
  mode: Mode;
  regions: TemplateRegion[];
}

export interface ModuleInstance {
  id: string;
  mode: Mode;
  startSec: number;
  durationSec: number;
}

export interface Bridge {
  id: string;
  fromInstanceId: string;
  toInstanceId: string;
  overlapSec: number;
}

export interface Composition {
  tracks: ArrTrack[];
  templates: Record<Mode, ModeTemplate>;
  sequence: ModuleInstance[];
  bridges: Bridge[];
  totalSec: number;
  tuningHz: number;
  masterDb: number;
}
