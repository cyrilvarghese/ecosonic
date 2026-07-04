import { describe, it, expect } from 'vitest';
import { snapshotSelection } from '@/arrange/snapshotSelection';
import type { Project, Track } from '@/types';

const tr = (id: string, muted: boolean, volumeDb: number): Track => ({
  id, category: 'PAD', label: id, sample: { name: id, path: id, bytes: 1 },
  volumeDb, muted, playing: true, locked: false,
});
const project: Project = {
  element: 'WATER', masterVolumeDb: -3, tuningHz: 432,
  tracks: [tr('a', false, -6), tr('b', true, 0), tr('c', false, 2)],
};

describe('snapshotSelection', () => {
  it('keeps only non-muted tracks', () => {
    expect(snapshotSelection(project).tracks.map((t) => t.id)).toEqual(['a', 'c']);
  });
  it('maps volumeDb to ceilingDb and passes element/tuning/master through', () => {
    const s = snapshotSelection(project);
    expect(s.tracks[0].ceilingDb).toBe(-6);
    expect(s.element).toBe('WATER');
    expect(s.tuningHz).toBe(432);
    expect(s.masterDb).toBe(-3);
  });
});
