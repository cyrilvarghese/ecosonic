export type ElementName = 'EARTH' | 'WATER' | 'AIR' | 'FIRE' | 'ETHER';
export const ELEMENTS: ElementName[] = ['EARTH', 'WATER', 'AIR', 'FIRE', 'ETHER'];

export type Category = 'ISO' | 'PLANET' | 'NOISE' | 'ELEMENT' | 'BASS' | 'PAD' | 'MELODY' | 'FX';

export interface SampleEntry {
  name: string;   // filename without extension
  path: string;   // relative to ECOSONIC FILES, using '/'
  bytes: number;
  ext: string;    // e.g. ".wav"
}

export interface ElementManifest {
  ISO: SampleEntry[];
  PLANET: SampleEntry[];
  NOISE: SampleEntry[];
  ELEMENT: SampleEntry[];
  BASS: SampleEntry[];
  PAD: SampleEntry[];
  MELODY: SampleEntry[];
  FX: SampleEntry[];
  ARP: SampleEntry[];          // recorded for future, NOT used by builder
  ELEMENT_SUB: SampleEntry[];  // recorded for future, NOT used by builder
}

export type Manifest = Record<ElementName, ElementManifest>;

export interface Track {
  id: string;
  category: Category;
  label: string;                         // e.g. "PLANETS A"
  sample: { name: string; path: string; bytes: number };
  volumeDb: number;                      // ceiling level
  muted: boolean;
  playing: boolean;
  locked: boolean;
}

export interface Project {
  element: ElementName | null;
  tracks: Track[];
  masterVolumeDb: number;
  tuningHz: number;
}
