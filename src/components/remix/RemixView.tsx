'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Menu } from '@base-ui/react/menu';
import { Check, ChevronDown } from 'lucide-react';
import { ELEMENTS, type Category, type ElementName } from '@/types';
import { config } from '@/config';
import { STACK_ORDER, type ArrTrack, type Mode } from '@/arrange/types';
import { useArrangement } from '@/arrange/arrangementStore';
import { useLayer2Engine } from '@/arrange/useLayer2Engine';
import { useModuleScheduler } from '@/arrange/useModuleScheduler';
import { estimatedWavBytes, exportFreeMixWav } from '@/remix/renderFreeMix';
import { DRY } from '@/audio/effects';
import { adjustToWholeLoops } from '@/remix/wholeLoops';
import { playLongOnce } from '@/remix/longSamples';
import { useRemix, type RemixMode } from './useRemix';
import { TrackPoolRow } from './TrackPoolRow';
import { ResultTimeline } from './ResultTimeline';

const BTN = 'rounded-md border border-border px-3 py-1.5 text-sm transition-calm hover:bg-muted/40';
const BTN_PRIMARY = 'rounded-md bg-[var(--accent-ink)] px-3 py-1.5 text-sm font-medium text-white';
const PILL = 'rounded px-3 py-1 text-sm transition-calm';
const CHIP = 'rounded-full border px-2.5 py-0.5 text-xs transition-calm';
const LIT = 'border-[var(--accent-ink)] bg-[var(--accent-ink)] text-white';

const clock = (s: number): string =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

const MODES: { value: RemixMode; label: string }[] = [
  { value: 'cross', label: 'Cross-element' },
  { value: 'scoped', label: 'Scoped' },
  { value: 'borrowed', label: 'Borrowed timings' },
];
/** null draws the whole authored session on its absolute timeline; a Mode draws one module. */
const SECTIONS: { value: Mode | null; label: string }[] = [
  { value: null, label: 'Full session' },
  { value: 'INTRODUCTION', label: 'Intro' },
  { value: 'DEEP_RELAXATION', label: 'Deep Relaxation' },
  { value: 'RETURN', label: 'Return' },
];
/** Borrowed has to name the element it plays, so every hint takes it and most ignore it. */
const HINT: Record<RemixMode, (el: ElementName) => string> = {
  cross: () => 'every track draws from the whole pool — its sample follows the element it picked',
  scoped: () => "every track draws from one element's rules, and that element's samples",
  borrowed: (el) => `every track plays ${el}'s samples, on timings drawn from every element`,
};

export function RemixView() {
  // /remix owns its own playback: without these two, playFreeMix flips store state that nothing
  // consumes — no engine to load the samples, no clock to trigger them.
  const engine = useLayer2Engine();
  useModuleScheduler(engine);

  const {
    tracks, picks, regions, totalSec, warnings, loading, loadError,
    mode, element, section, candidatesFor, setMode, setElement, setSection, regenerate, refetch,
    manual, toggleChip, resetCategory, canSound, toggleLock,
    setCategoryVolume, setCategorySend,
  } = useRemix();
  const masterDb = useArrangement((s) => s.masterDb);
  const playFreeMix = useArrangement((s) => s.playFreeMix);
  const setMixRegions = useArrangement((s) => s.setMixRegions);
  const playing = useArrangement((s) => s.playing);
  const positionSec = useArrangement((s) => s.positionSec);
  const pause = useArrangement((s) => s.pause);
  const seek = useArrangement((s) => s.seek);
  const setScrubbing = useArrangement((s) => s.setScrubbing);
  // Real sample lengths, filled in by useLayer2Engine once each file has loaded.
  const trackDurations = useArrangement((s) => s.trackDurations);
  const trackSends = useArrangement((s) => s.trackSends);
  // The DRAW's tracks always carry the ceiling the generator handed out; a level you set lives on
  // the store's copy of them. Everything that reads a level — the sliders, the export — has to come
  // through here, or it reads a default that is never anything but 0 dB.
  const storeTracks = useArrangement((s) => s.tracks);

  // Always install the mix, even when resuming: initFrom seeds moduleRegions with a Layer Two
  // module template that stops at moduleSeconds, so merely flipping `playing` played ten minutes
  // of the wrong arrangement.
  const onTransport = () => {
    if (playing) pause();
    else playFreeMix(mixRegions, totalSec, positionSec);
  };
  // A full-session draw takes one rule per section, so a track can have several picks lit.
  const pickedRules = new Set(picks.map((p) => p.rule));
  // Scoped narrows the pool to one element and takes its samples, so every chip in a row is already
  // the lane's own element and there is nothing a click could decide. Everywhere else a click means
  // something: which element owns the lane (cross) or which element's timing fills a
  // section (borrowed, where the sound is fixed by hand and sections may differ).
  const chipsClickable = mode !== 'scoped';
  // Rows come from the POOL, not from the lanes that happen to exist. A category you took over and
  // then silenced has no lanes, and deriving rows from tracks would make its row vanish — taking the
  // chips you would click to bring it back with it.
  const categories = STACK_ORDER.filter((c) => candidatesFor(c).length > 0);

  // Levels are stored per LANE, but a pool row is a category and may cover several lanes. The row
  // shows what its lanes hold in common — the first lane's level, since the only control that moves
  // them moves them together — and setting it writes through to every lane of that category.
  const lanesOf = (c: Category) => tracks.filter((t) => t.category === c);
  const sendsFor = (c: Category) => trackSends[lanesOf(c)[0]?.id ?? ''] ?? DRY;
  const leveled = (t: ArrTrack) => storeTracks.find((s) => s.id === t.id) ?? t;
  const volumeFor = (c: Category) => {
    const first = lanesOf(c)[0];
    return first ? leveled(first).ceilingDb : config.audio.volume.defaultTrackDb;
  };
  // Borrowed timings splits audio from timing, so colour has to pick a side per surface. Bars are
  // what you HEAR — one sample element, one colour, and a visible signal the mode is on. The pool
  // chips keep the rule's element, because which element's pattern won each section is the whole
  // point of the mode. (This also settles a latent collapse: a full-session draw has one pick per
  // section, so mapping picks→element would otherwise leave the last one winning arbitrarily.)
  const trackElements = Object.fromEntries(
    picks.map((p) => [p.track.id, mode === 'borrowed' ? element : p.rule.source.element]),
  );
  // null = not exporting. 0 = samples still downloading/decoding, which is the slow part and
  // reports nothing — the render only starts emitting progress once every sample is decoded.
  const [renderPct, setRenderPct] = useState<number | null>(null);
  const [exportFailed, setExportFailed] = useState(false);
  const [mutedIds, setMutedIds] = useState<ReadonlySet<string>>(new Set());
  // Which CATEGORY is under the cursor, wherever the cursor is. Held here rather than in either
  // component so the link is symmetric by construction: both surfaces render from the same fact,
  // rather than one pushing a highlight into the other.
  const [hoveredCategory, setHoveredCategory] = useState<Category | null>(null);
  const highlightedIds = new Set(
    hoveredCategory ? tracks.filter((t) => t.category === hoveredCategory).map((t) => t.id) : [],
  );
  // Lanes whose sample has not loaded. Their bars are already correct — the draw fixed those —
  // but the loop count and the whole-loop trim both wait on a length the engine reports after
  // loading, so those are shown as pending rather than as a number that would be a guess.
  const pendingIds = new Set(tracks.filter((t) => !trackDurations[t.id]).map((t) => t.id));

  // Mute addresses the ROW. A rotating lane is several tracks taking turns on one row, so silencing
  // it has to silence all of them — otherwise the row goes quiet for one section and comes back.
  const toggleMute = (trackId: string) =>
    setMutedIds((prev) => {
      const rowId = tracks.find((t) => t.id === trackId)?.row?.id ?? trackId;
      const siblings = tracks.filter((t) => (t.row?.id ?? t.id) === rowId);
      const next = new Set(prev);
      const silencing = !prev.has(trackId);
      for (const s of siblings) { if (silencing) next.add(s.id); else next.delete(s.id); }
      return next;
    });

  // Re-applied on every redraw: the engine reloads its layers when the draw changes, and a fresh
  // layer starts unmuted.
  useEffect(() => {
    for (const t of tracks) engine.setMute(t.id, mutedIds.has(t.id));
  }, [engine, tracks, mutedIds]);

  // Trim every interval to a whole number of loops so nothing is cut mid-sample. Needs the engine's
  // reported sample lengths, so it does nothing until those arrive.
  // On by default: a sample cut part-way through a pass is a seam you hear, and wanting that is the
  // rarer choice. It has no effect until the engine reports sample lengths, so a mix that starts
  // before they land trims itself the moment they arrive (the effect below reinstalls it).
  const [wholeLoops, setWholeLoops] = useState(true);
  // Long samples play ONE pass, whatever the checkbox says (§6a) — applied after the trim so the
  // trim cannot extend one back out to two passes.
  const mixRegions = playLongOnce(
    wholeLoops ? adjustToWholeLoops(regions, trackDurations, totalSec) : regions,
    trackDurations, (id) => tracks.find((t) => t.id === id)?.category, config,
  );

  // Play installs the mix ONCE. Reshape it while the transport is running — tick the whole-loops
  // box, or have the engine report a sample length that changes the trim — and the scheduler was
  // still reading what got installed back then: the timeline drew a clipped track that went on
  // sounding to its old end. Recomputed here rather than depending on `mixRegions`, which is a
  // fresh array every render and would reinstall the mix on each one.
  useEffect(() => {
    if (!playing) return;
    setMixRegions(playLongOnce(
      wholeLoops ? adjustToWholeLoops(regions, trackDurations, totalSec) : regions,
      trackDurations, (id) => tracks.find((t) => t.id === id)?.category, config,
    ));
  }, [playing, wholeLoops, regions, trackDurations, totalSec, tracks, setMixRegions]);

  // Mute is part of the mix, not just monitoring — a muted track is absent from the export too. So
  // is volume: the renderer builds its envelope from ceilingDb, so the export takes the store's
  // copy of each track rather than the draw's, which never carries anything but the default.
  const audible = tracks.filter((t) => !mutedIds.has(t.id)).map(leveled);
  const audibleRegions = mixRegions.filter((r) => !mutedIds.has(r.trackId));

  const onExport = async () => {
    setExportFailed(false);
    setRenderPct(0);
    try {
      const blob = await exportFreeMixWav({
        tracks: audible, regions: audibleRegions, totalSec, masterDb, sends: trackSends,
        onProgress: setRenderPct,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = section ? `remix-${section.toLowerCase()}.wav` : 'remix.wav';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // Offline rendering decodes whole samples; a missing file or an out-of-memory render both
      // land here, and both used to look identical to nothing happening.
      setExportFailed(true);
    } finally {
      setRenderPct(null);
    }
  };

  const exportLabel =
    renderPct === null ? '⬇ Export WAV'
      : renderPct === 0 ? '⏳ Loading samples…'
        : `⏳ Rendering ${Math.round(renderPct * 100)}%`;

  // Which element an uploaded session is filed under. The server stores it with that prefix, which
  // is how loadSessions finds it again — it is not inferred from the file's name.
  const [uploadAs, setUploadAs] = useState<ElementName>(ELEMENTS[0]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // The element is captured when the picker is opened, not read back when the file arrives — the
  // menu sets state and opens the dialog in one gesture, and the two must not be able to disagree.
  const pendingElement = useRef<ElementName>(uploadAs);
  const pickFileFor = (element: ElementName) => {
    setUploadAs(element);
    pendingElement.current = element;
    fileInput.current?.click();
  };

  const onUpload = async (file: File, element: ElementName) => {
    setUploadError(null);
    try {
      const markdown = await file.text();
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, markdown, element }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) { setUploadError(body.error ?? 'upload failed'); return; }
      await refetch();
    } catch {
      setUploadError('upload failed');
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {loading && <p className="text-sm text-muted-foreground">Loading rules…</p>}
      {loadError && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          Could not load the authored sessions — every pool below will be empty. {loadError}
        </p>
      )}
      {warnings.length > 0 && (
        <details className="text-xs text-amber-600 dark:text-amber-400">
          <summary className="cursor-pointer">
            {warnings.length} warning{warnings.length > 1 ? 's' : ''}
          </summary>
          <ul className="mt-1 list-disc pl-5">
            {warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </details>
      )}

      <section className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
        <div className="inline-flex rounded-md border border-border p-0.5">
          {MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              aria-pressed={mode === m.value}
              onClick={() => setMode(m.value)}
              className={`${PILL} ${mode === m.value ? LIT : 'text-muted-foreground hover:bg-muted/40'}`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* The same chips serve two meanings: in scoped they narrow the rules, in borrowed they
            choose the sound. Only the latter needs saying, hence the caption on that mode alone. */}
        {(mode === 'scoped' || mode === 'borrowed') && (
          <div className="flex flex-wrap items-center gap-1">
            {mode === 'borrowed' && (
              <span className="mr-0.5 text-xs text-muted-foreground">Sound:</span>
            )}
            {ELEMENTS.map((el) => (
              <button
                key={el}
                type="button"
                aria-pressed={el === element}
                onClick={() => setElement(el)}
                className={`${CHIP} ${el === element ? LIT : 'border-border text-muted-foreground opacity-70 hover:opacity-100'}`}
              >
                {el}
              </button>
            ))}
          </div>
        )}

        <p className="text-xs text-muted-foreground">{HINT[mode](element)}</p>

        <Link
          href="/rulebook"
          className="text-xs text-muted-foreground underline decoration-dotted underline-offset-2 transition-calm hover:text-[var(--accent-ink)]"
        >
          rulebook →
        </Link>

        <div className="flex w-full flex-wrap items-center gap-1">
          {SECTIONS.map((s) => (
            <button
              key={s.label}
              type="button"
              aria-pressed={section === s.value}
              onClick={() => setSection(s.value)}
              className={`${CHIP} ${section === s.value ? LIT : 'border-border text-muted-foreground opacity-70 hover:opacity-100'}`}
            >
              {s.label}
            </button>
          ))}
          <span className="ml-1 text-xs text-muted-foreground">
            {section
              ? 'one module, rules rebased to the section start'
              : 'the whole authored session on one timeline'}
          </span>
        </div>
        </div>

        {/* Adding source material, kept away from the controls that shape the current mix. */}
        <div className="flex shrink-0 flex-col items-end gap-1">
          {/* Hosted, POST /api/sessions does not exist — a control that can only fail is worse
              than no control. Sessions ship baked into the bundle instead; authoring stays local. */}
          {!process.env.NEXT_PUBLIC_STATIC_EXPORT && (
          <>
          {/* Split button: upload, with the element it files under attached to the same control. */}
          <div className="inline-flex overflow-hidden rounded-md border border-border shadow-sm">
            <button
              type="button"
              onClick={() => pickFileFor(uploadAs)}
              className="whitespace-nowrap px-3 py-1.5 text-sm transition-calm hover:bg-muted/40"
            >
              ⬆ Upload session
            </button>
            <Menu.Root>
              <Menu.Trigger
                aria-label={`Upload as ${uploadAs}`}
                className="flex items-center gap-1 border-l border-border px-2 text-xs text-muted-foreground transition-calm hover:bg-muted/40"
              >
                {uploadAs}
                <ChevronDown size={14} />
              </Menu.Trigger>
              <Menu.Portal>
                <Menu.Positioner side="bottom" align="end" sideOffset={6} className="z-50">
                  <Menu.Popup className="min-w-40 rounded-[var(--radius-md)] border border-border bg-popover p-1 text-popover-foreground shadow-lg outline-none">
                    <div className="px-2 pb-1 pt-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                      Upload as
                    </div>
                    {ELEMENTS.map((el) => (
                      <Menu.Item
                        key={el}
                        onClick={() => pickFileFor(el)}
                        className="flex cursor-pointer items-center justify-between gap-6 rounded px-2 py-1.5 text-sm outline-none select-none data-[highlighted]:bg-muted"
                      >
                        {el}
                        {uploadAs === el && <Check size={14} className="text-[var(--accent-ink)]" />}
                      </Menu.Item>
                    ))}
                  </Menu.Popup>
                </Menu.Positioner>
              </Menu.Portal>
            </Menu.Root>
            <input
              ref={fileInput}
              type="file"
              accept=".md"
              aria-label="Session file"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onUpload(f, pendingElement.current);
                e.target.value = ''; // let the same file be re-uploaded after a fix
              }}
            />
          </div>
          {uploadError && (
            <p className="text-xs text-red-600 dark:text-red-400">Upload failed — {uploadError}</p>
          )}
          </>
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-1 text-base font-medium">Tracks — pool &amp; pick</h2>
        {tracks.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {loading
              ? 'Loading rules…'
              : mode === 'scoped'
                ? `No authored rules for ${element} — pick another element, or upload a session below.`
                : 'No authored rules loaded — upload a session below to start.'}
          </p>
        ) : (
          categories.map((c) => (
            <TrackPoolRow
              key={c}
              category={c}
              candidates={candidatesFor(c)}
              picked={pickedRules}
              pins={manual[c]}
              onPick={chipsClickable ? toggleChip : undefined}
              canSound={canSound}
              manual={c in manual}
              onReset={() => resetCategory(c)}
              sends={sendsFor(c)}
              onSend={(kind, value) => setCategorySend(c, kind, value)}
              volumeDb={volumeFor(c)}
              onVolume={(db) => setCategoryVolume(c, db)}
              highlighted={hoveredCategory === c}
              onHover={(on) => setHoveredCategory(on ? c : null)}
            />
          ))
        )}
      </section>

      <section className="rounded-[var(--radius-md)] border border-[var(--accent-ink)] bg-card p-4">
        <h3 className="mb-2 text-sm font-medium">
          Final result — {SECTIONS.find((s) => s.value === section)?.label ?? 'full session'}
        </h3>
        <ResultTimeline
          regions={mixRegions}
          totalSec={totalSec}
          tracks={tracks}
          positionSec={positionSec}
          trackElements={trackElements}
          onScrub={seek}
          onScrubStart={() => setScrubbing(true)}
          onScrubEnd={() => setScrubbing(false)}
          mutedIds={mutedIds}
          onToggleMute={toggleMute}
          // A lock is held per CATEGORY — that is the grain the draw's random stream runs at. Since
          // a generated category is one lane the two coincide, except for PLANET's pair, which
          // shares a rule and so locks and releases together.
          onToggleLock={(id) => {
            const track = tracks.find((t) => t.id === id);
            if (track) toggleLock(track.category);
          }}
          trackDurations={trackDurations}
          pendingIds={pendingIds}
          highlightedIds={highlightedIds}
          // A lane reports itself; the category it belongs to is what both surfaces highlight on.
          onHoverTrack={(id) =>
            setHoveredCategory(id ? tracks.find((t) => t.id === id)?.category ?? null : null)}
        />
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={BTN_PRIMARY}
            title="Reroll every track that is not locked"
            onClick={regenerate}
          >
            🎲 Regenerate
          </button>
          <button type="button" className={BTN} onClick={onTransport}>
            {playing ? '⏸ Pause' : '▶ Play'}
          </button>
          <span data-testid="transport-clock" className="text-xs tabular-nums text-muted-foreground">
            {clock(positionSec)} / {clock(totalSec)}
          </span>
          {pendingIds.size > 0 && tracks.length > 0 && (
            <span data-testid="samples-loading" className="text-xs tabular-nums text-muted-foreground">
              ⏳ Loading samples… {tracks.length - pendingIds.size}/{tracks.length}
            </span>
          )}
          <label
            className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground"
            title="Resize every interval to a whole number of loops, so no sample is cut part-way through a pass. Rounds to the nearest whole loop, never below one."
          >
            <input
              type="checkbox"
              checked={wholeLoops}
              onChange={(e) => setWholeLoops(e.target.checked)}
              style={{ accentColor: 'var(--accent-ink)' }}
            />
            Adjust intervals to whole loops
          </label>
          <button
            type="button"
            className={BTN}
            disabled={renderPct !== null}
            title={`≈${Math.round(estimatedWavBytes(totalSec) / 1e6)} MB WAV — samples are decoded whole, so a full session is heavy`}
            onClick={() => void onExport()}
          >
            {exportLabel}
          </button>
        </div>
        {exportFailed && (
          <p className="mt-2 text-xs text-red-600 dark:text-red-400">
            Export failed — check the sample files are reachable, or try a single section rather than
            the full session.
          </p>
        )}
      </section>
    </div>
  );
}
