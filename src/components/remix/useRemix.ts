'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import manifestJson from '@/manifest.json';
import { ELEMENTS, type Category, type ElementName, type Manifest } from '@/types';
import type { ArrTrack, Mode, TemplateRegion } from '@/arrange/types';
import { config } from '@/config';
import { arrangementStore } from '@/arrange/arrangementStore';
import type { AuthoredRule, RuleStore } from '@/remix/sessionRules';
import { generateRemix, type RemixPick } from '@/remix/generateRemix';
import { ruleKey, slotKey, type Manual, type Pins } from '@/remix/pins';
import { loadSessionStore } from '@/sessions';

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
  /** null = the authored-rule store loaded. Non-null = why it did not. Without this a failed
   *  fetch left the page spinning forever, which is what a static export would have shipped. */
  loadError: string | null;
  mode: RemixMode;
  element: ElementName;
  /** null = the whole session on its absolute timeline; a Mode = one fixed-length section module. */
  section: Mode | null;
  /** The candidates the current mode can draw from for a category — what a pool row renders. */
  candidatesFor: (c: Category) => AuthoredRule[];
  /** Whether this rule could ever produce a lane, i.e. whether the element it would sound through
   *  ships a sample for its category. False only for the §3.6 gap — WATER and ETHER author
   *  `ELEMENT_SUB` rules but ship no `ELEMENT_SUB` file. */
  canSound: (rule: AuthoredRule) => boolean;
  /** category → the timings chosen by hand. A category listed here is manual — the generator has
   *  handed it over, and its rules no longer apply to it. */
  manual: Manual;
  /** Turn this timing on or off. The first click on a category **freezes what it was already
   *  playing** and takes the category manual, so an edit builds on what you were hearing. */
  toggleChip: (rule: AuthoredRule) => void;
  /** Hand a category back to the generator. */
  resetCategory: (c: Category) => void;
  /** Hold this category's draw against Regenerate, or release it. Locking pins it to the seed that
   *  is current now, so it redraws to exactly what you are hearing while the rest rerolls. */
  toggleLock: (c: Category) => void;
  /** Set the level (dB) on every lane of a category, and remember it across redraws. */
  setCategoryVolume: (c: Category, db: number) => void;
  /** Set one aux send on every lane of a category, and remember it across redraws. */
  setCategorySend: (c: Category, kind: 'reverb' | 'delay', value: number) => void;
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
  /** null = the store loaded. Non-null = why it did not, for the UI to show instead of spinning. */
  const [loadError, setLoadError] = useState<string | null>(null);
  const [seed, setSeed] = useState(1);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<RemixMode>('cross');
  const [element, setElement] = useState<ElementName>(ELEMENTS[0]);
  const [section, setSection] = useState<Mode | null>(null);
  const [manual, setManual] = useState<Manual>({});
  /** category → the seed it was locked on. Present = locked: Regenerate advances `seed` and this
   *  category keeps drawing from the one recorded here, so it holds exactly what you were hearing. */
  const [lockedSeeds, setLockedSeeds] = useState<Record<string, number>>({});
  /** The mix you dialled in, keyed by lane id — and ONLY what you actually moved, so a category you
   *  never touched keeps its config default rather than being pinned to whatever it happened to
   *  start at. `initFrom` rebuilds `tracks` and reseeds `trackSends` on every redraw, so without
   *  this a chip click silently reset your whole mix. A ref, not state: re-applying writes to the
   *  store, and the store is what the sliders render from. */
  const levels = useRef<Record<string, { volumeDb?: number; reverb?: number; delay?: number }>>({});

  const refetch = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      // Goes through the seam, not fetch: hosted as a static export there is no /api/sessions,
      // and the same data is baked into the bundle at build time.
      const body = await loadSessionStore();
      setStore(body.store);
      setParserWarnings(body.warnings ?? []);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
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
  const borrowing = mode === 'borrowed';
  const sampleElement = borrowing ? element : undefined;

  const draw = useMemo(
    () => generateRemix(pool, manifest, {
      seed,
      element: scopedTo,
      sampleElement,
      section: section ?? undefined,
      sessionSec: sessionMin * 60,
      locked: lockedSeeds,
      manual,
    }),
    // `manual` and `lockedSeeds` are inputs to the draw, not decorations on it — determinism
    // includes them.
    [pool, seed, scopedTo, sampleElement, section, sessionMin, lockedSeeds, manual],
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

    // Put your levels back. initFrom has just flattened them to the config defaults, so this runs in
    // the SAME effect body — no render sits between the reset and the restore, and the engine's
    // reload (keyed on the track list, which only changes once this has landed) reads the restored
    // state rather than a momentary default. A lane the draw did not produce is skipped but kept:
    // come back to that element and your level is still there.
    const st = arrangementStore.getState();
    const drawn = new Set(draw.tracks.map((t) => t.id));
    for (const [id, level] of Object.entries(levels.current)) {
      if (!drawn.has(id)) continue;
      if (level.volumeDb !== undefined) st.setTrackCeilingDb(id, level.volumeDb);
      if (level.reverb !== undefined) st.setTrackSend(id, 'reverb', level.reverb);
      if (level.delay !== undefined) st.setTrackSend(id, 'delay', level.delay);
    }
  }, [draw, scopedTo, sampleElement, sessionMin]);

  // Both write through to every lane of the category: a pool row IS a category, and a category you
  // took over may hold several. Coarser than the store, which keys both per lane — deliberately so.
  const setCategoryVolume = useCallback((c: Category, db: number) => {
    const st = arrangementStore.getState();
    for (const t of draw.tracks.filter((t) => t.category === c)) {
      levels.current[t.id] = { ...levels.current[t.id], volumeDb: db };
      st.setTrackCeilingDb(t.id, db);
    }
  }, [draw.tracks]);

  const setCategorySend = useCallback((c: Category, kind: 'reverb' | 'delay', value: number) => {
    const st = arrangementStore.getState();
    for (const t of draw.tracks.filter((t) => t.category === c)) {
      levels.current[t.id] = { ...levels.current[t.id], [kind]: value };
      st.setTrackSend(t.id, kind, value);
    }
  }, [draw.tracks]);

  // Mirrors the generator's filters exactly — a chip the draw could never pick would be a lie.
  const candidatesFor = useCallback(
    (c: Category) => pool.filter((r) =>
      r.category === c
      && (!scopedTo || r.source.element === scopedTo)
      && (!section || r.section === section)),
    [pool, scopedTo, section],
  );

  // Which element a rule would SOUND through: its own, or the one borrowing fixed by hand. Borrowing
  // is what rescues WATER's and ETHER's ELEMENT_SUB timings — under EARTH audio they play fine.
  const canSound = useCallback(
    (rule: AuthoredRule) =>
      (manifest[sampleElement ?? rule.source.element]?.[rule.category] ?? []).length > 0,
    [sampleElement],
  );

  /** Everything the generator currently gives a category, as explicit choices. Freezing this on the
   *  first click is what makes an edit ADD to what you were hearing rather than wipe the row. */
  const frozen = useCallback(
    (c: Category): Pins => Object.fromEntries(
      draw.picks.filter((p) => p.track.category === c).map((p) => [slotKey(p.rule), ruleKey(p.rule)]),
    ),
    [draw.picks],
  );

  // A chip is a plain on/off. The first click on a category takes it MANUAL — from then on the
  // generator neither draws it nor applies its rules to it, and what is lit is exactly what sounds.
  // Turn every chip in a row off and the category falls silent; that is a legitimate thing to want,
  // so it is not quietly handed back to the draw. `resetCategory` is how you hand it back.
  const toggleChip = useCallback((rule: AuthoredRule) => {
    setManual((prev) => {
      const cat = rule.category;
      const current = prev[cat] ?? frozen(cat);
      const slot = slotKey(rule);
      const key = ruleKey(rule);
      const next = { ...current };
      // One timing per slot: a lane has one Introduction, so choosing another replaces it rather
      // than stacking two overlapping regions on one voice, where the second would never sound.
      if (next[slot] === key) delete next[slot];
      else next[slot] = key;
      // Borrowing collapses the category to ONE lane, so its slots are sections rather than
      // element×sections. Two elements' Introductions would land on the same voice, overlap, and
      // one of them would never be heard — so choosing a section's timing replaces what was there.
      if (borrowing) {
        for (const k of Object.keys(next)) {
          if (k === slot) continue;
          const [, , sec] = k.split('|');
          if (sec === rule.section) delete next[k];
        }
      }
      return { ...prev, [cat]: next };
    });
  }, [frozen, borrowing]);

  // Records the seed that is current NOW, so what you locked is what you were listening to. Storing
  // the seed rather than the drawn tracks keeps the category generated: its rules still govern it,
  // and it redraws (identically) if the mode or section around it changes.
  const toggleLock = useCallback((c: Category) => {
    setLockedSeeds((prev) => {
      if (c in prev) {
        const next = { ...prev };
        delete next[c];
        return next;
      }
      return { ...prev, [c]: seed };
    });
  }, [seed]);

  const resetCategory = useCallback((c: Category) => {
    setManual((prev) => {
      if (!(c in prev)) return prev;
      const next = { ...prev };
      delete next[c];
      return next;
    });
  }, []);

  return {
    tracks: draw.tracks,
    picks: draw.picks,
    regions: draw.regions,
    totalSec: draw.totalSec,
    warnings: [...parserWarnings, ...draw.warnings],
    loading,
    loadError,
    mode,
    element,
    section,
    candidatesFor,
    canSound,
    manual,
    toggleChip,
    resetCategory,
    toggleLock,
    setCategoryVolume,
    setCategorySend,
    setMode,
    setElement,
    setSection,
    regenerate: () => setSeed((n) => n + 1),
    refetch,
  };
}
