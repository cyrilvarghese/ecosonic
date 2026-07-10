import type { ElementManifest, ElementName, Manifest, SampleEntry } from '@/types';
import { ELEMENTS } from '@/types';

export interface RawFile {
  path: string; // relative to ECOSONIC FILES, '/'-separated
  bytes: number;
}

const AUDIO_EXTS = new Set(['.wav', '.mp3']);
const SOUND_CATEGORIES = new Set(['BASS', 'PAD', 'MELODY', 'FX', 'ARP']);

function emptyElement(): ElementManifest {
  return {
    ISO: [], PLANET: [], NOISE: [], ELEMENT: [],
    BASS: [], PAD: [], MELODY: [], FX: [], ARP: [], ELEMENT_SUB: [], DRONE: [],
  };
}

function isCruft(part: string): boolean {
  return part.startsWith('.') || part.startsWith('._');
}

function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i < 0 ? '' : name.slice(i).toLowerCase();
}

function categoryOf(parts: string[]): keyof ElementManifest | null {
  const l1 = parts[1]?.toUpperCase();
  if (l1 === 'ISO' || l1 === 'PLANET' || l1 === 'NOISE' || l1 === 'DRONE') return l1;
  if (l1 === 'ELEMENT') return parts[2]?.toUpperCase() === 'SUB' ? 'ELEMENT_SUB' : 'ELEMENT';
  if (l1 === 'SOUND') {
    const c = parts[2]?.toUpperCase();
    if (c && SOUND_CATEGORIES.has(c)) return c as keyof ElementManifest;
  }
  return null;
}

export function buildManifest(files: RawFile[]): Manifest {
  const manifest = Object.fromEntries(
    ELEMENTS.map((e) => [e, emptyElement()]),
  ) as Manifest;

  for (const f of files) {
    const parts = f.path.split('/').filter(Boolean);
    if (parts.length < 3) continue;
    if (parts.some(isCruft)) continue;

    const element = parts[0].toUpperCase() as ElementName;
    if (!ELEMENTS.includes(element)) continue;

    const fileName = parts[parts.length - 1];
    const ext = extOf(fileName);
    if (!AUDIO_EXTS.has(ext)) continue;

    const category = categoryOf(parts);
    if (!category) continue;

    const entry: SampleEntry = {
      name: fileName.slice(0, fileName.length - ext.length),
      path: f.path,
      bytes: f.bytes,
      ext,
    };
    manifest[element][category].push(entry);
  }

  return manifest;
}
