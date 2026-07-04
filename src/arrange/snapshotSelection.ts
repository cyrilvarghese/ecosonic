import type { ElementName, Project } from '@/types';
import type { ArrTrack } from '@/arrange/types';

/** Freeze the Layer One selection into Layer Two input: non-muted tracks, volumeDb→ceilingDb. */
export function snapshotSelection(project: Project): {
  element: ElementName | null; tracks: ArrTrack[]; tuningHz: number; masterDb: number;
} {
  const tracks: ArrTrack[] = project.tracks
    .filter((t) => !t.muted)
    .map((t) => ({
      id: t.id, category: t.category, label: t.label, sample: t.sample,
      ceilingDb: t.volumeDb, locked: t.locked,
    }));
  return { element: project.element, tracks, tuningHz: project.tuningHz, masterDb: project.masterVolumeDb };
}
