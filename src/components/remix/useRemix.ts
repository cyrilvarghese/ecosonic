'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import manifestJson from '@/manifest.json';
import { ELEMENTS, type Category, type ElementName, type Manifest } from '@/types';
import type { ArrTrack, TemplateRegion } from '@/arrange/types';
import { config } from '@/config';
import { arrangementStore, useArrangement } from '@/arrange/arrangementStore';
import type { AuthoredRule, RuleStore } from '@/remix/sessionRules';
import { generateRemix, type RemixPick } from '@/remix/generateRemix';

const manifest = manifestJson as unknown as Manifest;
const EMPTY_STORE: RuleStore = { EARTH: [], WATER: [], AIR: [], FIRE: [], ETHER: [] };

/** `cross` draws every track from the whole authored pool; `scoped` from one element's rules only. */
export type RemixMode = 'scoped' | 'cross';

export interface RemixState {
  tracks: ArrTrack[];
  picks: RemixPick[];
  regions: TemplateRegion[];
  totalSec: number;
  warnings: string[];
  loading: boolean;
  mode: RemixMode;
  element: ElementName;
  /** The candidates the current mode can draw from for a category — what a pool row renders. */
  candidatesFor: (c: Category) => AuthoredRule[];
  setMode: (m: RemixMode) => void;
  setElement: (e: ElementName) => void;
  regenerate: () => void;
  refetch: () => Promise<void>;
}

/** Fetches the authored-rule store from /api/sessions and derives a whole free mix from it — tracks
 *  included. Self-sufficient: nothing here reads an Arrange setup, so a direct visit to /remix works. */
export function useRemix(): RemixState {
  const durationMin = useArrangement((s) => s.durationMin);
  const [store, setStore] = useState<RuleStore>(EMPTY_STORE);
  const [parserWarnings, setParserWarnings] = useState<string[]>([]);
  const [seed, setSeed] = useState(1);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<RemixMode>('cross');
  const [element, setElement] = useState<ElementName>(ELEMENTS[0]);

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

  // The one difference between the modes: undefined ⇒ the generator keeps the whole pool.
  const scopedTo = mode === 'scoped' ? element : undefined;

  const draw = useMemo(
    () => generateRemix(pool, manifest, { seed, element: scopedTo }),
    [pool, seed, scopedTo],
  );

  // The scheduler and the WAV renderer both read arrangementStore.tracks — keep them in step with
  // the derived draw. Safe from a loop: this hook no longer reads s.tracks, and `draw` is memoized.
  useEffect(() => {
    arrangementStore.getState().initFrom(
      {
        element: scopedTo ?? null,
        tracks: draw.tracks,
        tuningHz: config.audio.tuning.defaultHz,
        masterDb: config.audio.volume.defaultMasterDb,
      },
      durationMin,
    );
  }, [draw, scopedTo, durationMin]);

  const candidatesFor = useCallback(
    (c: Category) => pool.filter((r) => r.category === c && (!scopedTo || r.source.element === scopedTo)),
    [pool, scopedTo],
  );

  return {
    tracks: draw.tracks,
    picks: draw.picks,
    regions: draw.regions,
    totalSec: durationMin * 60,
    warnings: [...parserWarnings, ...draw.warnings],
    loading,
    mode,
    element,
    candidatesFor,
    setMode,
    setElement,
    regenerate: () => setSeed((n) => n + 1),
    refetch,
  };
}
