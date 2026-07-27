'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Category } from '@/types';
import type { ArrTrack, TemplateRegion } from '@/arrange/types';
import { useArrangement } from '@/arrange/arrangementStore';
import { poolFor, type RuleStore } from '@/remix/sessionRules';
import { generateFreeMix, type Pick } from '@/remix/generateFreeMix';

const EMPTY_STORE: RuleStore = { EARTH: [], WATER: [], AIR: [], FIRE: [], ETHER: [] };

export interface RemixState {
  tracks: ArrTrack[];
  picks: Pick[];
  regions: TemplateRegion[];
  totalSec: number;
  warnings: string[];
  loading: boolean;
  regenerate: () => void;
  refetch: () => Promise<void>;
}

/** Fetches the authored-rule store from /api/sessions, derives a free-mix (one rule per Arrange
 *  track) from the current tracks + a seed, and exposes a regenerate/refetch pair. */
export function useRemix(): RemixState {
  const tracks = useArrangement((s) => s.tracks);
  const durationMin = useArrangement((s) => s.durationMin);
  const [store, setStore] = useState<RuleStore>(EMPTY_STORE);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [seed, setSeed] = useState(1);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/sessions');
    const body = (await res.json()) as { store: RuleStore; warnings: string[] };
    setStore(body.store);
    setWarnings(body.warnings ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { void refetch(); }, [refetch]);

  const { regions, picks } = useMemo(
    () => generateFreeMix(tracks, (c: Category) => poolFor(store, c), seed),
    [tracks, store, seed],
  );

  return {
    tracks,
    picks,
    regions,
    totalSec: durationMin * 60,
    warnings,
    loading,
    regenerate: () => setSeed((n) => n + 1),
    refetch,
  };
}
