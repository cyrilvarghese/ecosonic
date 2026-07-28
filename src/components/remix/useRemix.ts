'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import manifestJson from '@/manifest.json';
import { ELEMENTS, type Category, type ElementName, type Manifest } from '@/types';
import type { ArrTrack, Mode, TemplateRegion } from '@/arrange/types';
import { config } from '@/config';
import { arrangementStore } from '@/arrange/arrangementStore';
import type { AuthoredRule, RuleStore } from '@/remix/sessionRules';
import { generateRemix, type RemixPick } from '@/remix/generateRemix';

const manifest = manifestJson as unknown as Manifest;
const EMPTY_STORE: RuleStore = { EARTH: [], WATER: [], AIR: [], FIRE: [], ETHER: [] };

/** `cross` draws every track from the whole authored pool; `scoped` from one element's rules only;
 *  `borrowed` draws timings from every element but plays them all through one element's samples. */
export type RemixMode = 'scoped' | 'cross' | 'borrowed';

export interface RemixState {
  tracks: ArrTrack[];
  picks: RemixPick[];
  regions: TemplateRegion[];
  totalSec: number;
  warnings: string[];
  loading: boolean;
  mode: RemixMode;
  element: ElementName;
  /** null = the whole session on its absolute timeline; a Mode = one fixed-length section module. */
  section: Mode | null;
  /** The candidates the current mode can draw from for a category — what a pool row renders. */
  candidatesFor: (c: Category) => AuthoredRule[];
  setMode: (m: RemixMode) => void;
  setElement: (e: ElementName) => void;
  setSection: (s: Mode | null) => void;
  regenerate: () => void;
  refetch: () => Promise<void>;
}

/** Fetches the authored-rule store from /api/sessions and derives a whole free mix from it — tracks
 *  included. Self-sufficient: nothing here reads an Arrange setup, so a direct visit to /remix works. */
export function useRemix(): RemixState {
  // The session length is held here, NOT read back from the store: seeding a section draw writes the
  // module length (10 min) into arrangementStore.durationMin, so reading it back would shrink the
  // full-session draw to 10 minutes the moment you returned to it.
  const [sessionMin] = useState(() => arrangementStore.getState().durationMin);
  const [store, setStore] = useState<RuleStore>(EMPTY_STORE);
  const [parserWarnings, setParserWarnings] = useState<string[]>([]);
  const [seed, setSeed] = useState(1);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<RemixMode>('cross');
  const [element, setElement] = useState<ElementName>(ELEMENTS[0]);
  const [section, setSection] = useState<Mode | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/sessions');
    const body = (await res.json()) as { store: RuleStore; warnings: string[] };
    setStore(body.store);
    setParserWarnings(body.warnings ?? []);
    setLoading(false);
  }, []);

  // Standard fetch-on-mount: refetch only setStates after the awaited fetch resolves.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void refetch(); }, [refetch]);

  const pool = useMemo(
    () => Object.values(store).flatMap((docs) => docs.flatMap((d) => d.rules)),
    [store],
  );

  // The modes differ only here. Scoped narrows the RULES; borrowed fixes the AUDIO and leaves the
  // rules wide open. Both read the same `element` state, so switching modes keeps your choice.
  const scopedTo = mode === 'scoped' ? element : undefined;
  const sampleElement = mode === 'borrowed' ? element : undefined;

  const draw = useMemo(
    () => generateRemix(pool, manifest, {
      seed,
      element: scopedTo,
      sampleElement,
      section: section ?? undefined,
      sessionSec: sessionMin * 60,
    }),
    [pool, seed, scopedTo, sampleElement, section, sessionMin],
  );

  // The scheduler and the WAV renderer both read arrangementStore.tracks — keep them in step with
  // the derived draw. Safe from a loop: this hook no longer reads s.tracks, and `draw` is memoized.
  useEffect(() => {
    arrangementStore.getState().initFrom(
      {
        // Borrowed mode has one element for all its audio even though its rules do not, so the
        // store hears about it — this field describes the sound, not the rule scope.
        element: scopedTo ?? sampleElement ?? null,
        tracks: draw.tracks,
        tuningHz: config.audio.tuning.defaultHz,
        masterDb: config.audio.volume.defaultMasterDb,
      },
      // The SESSION length, never the draw's. durationMin is what a later mount reads back as the
      // session length, so seeding a 10-minute section module here made the next "full session"
      // ten minutes long. The draw's own length belongs in durationSec.
      sessionMin,
    );
    // initFrom leaves durationSec at the Layer Two module default; seek() clamps against it, so
    // without this the playhead could not be dragged past 10 minutes of a 30-minute mix.
    arrangementStore.setState({ durationSec: draw.totalSec });
  }, [draw, scopedTo, sampleElement, sessionMin]);

  // Mirrors the generator's filters exactly — a chip the draw could never pick would be a lie.
  const candidatesFor = useCallback(
    (c: Category) => pool.filter((r) =>
      r.category === c
      && (!scopedTo || r.source.element === scopedTo)
      && (!section || r.section === section)),
    [pool, scopedTo, section],
  );

  return {
    tracks: draw.tracks,
    picks: draw.picks,
    regions: draw.regions,
    totalSec: draw.totalSec,
    warnings: [...parserWarnings, ...draw.warnings],
    loading,
    mode,
    element,
    section,
    candidatesFor,
    setMode,
    setElement,
    setSection,
    regenerate: () => setSeed((n) => n + 1),
    refetch,
  };
}
