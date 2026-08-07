# Per-track volume in the remix rows

**Date:** 2026-08-07
**Branch:** `feat/track-volume`

## The ask

Each pool row on `/remix` carries a Rev and a Dly slider. Add a Vol slider beside them, and have it
take effect while the mix is playing.

## What already exists

Almost all of it. This is a UI change over plumbing that was built for Layer Two and never surfaced
on `/remix`:

| Piece | Where | State |
|---|---|---|
| Per-track level, in dB | `ArrTrack.ceilingDb` (`arrange/types.ts`) | exists, seeded to `config.audio.volume.defaultTrackDb` by `generateRemix` |
| Store setter | `arrangementStore.setTrackCeilingDb` | exists |
| Realtime application | `useLayer2Engine` subscription → `engine.setTrackVolume` → `Layer.setVolumeDb` | exists — a `linearRampToValueAtTime` over `changeRampMs` (200 ms) |
| Offline render | `renderModuleWav` → `dbToGain(track.ceilingDb, minDb)` | exists — the WAV honours it |
| A dB slider | `ModuleDesigner` (Layer Two) | exists, −20…+20 dB at 1 dB steps |

So no audio code is written here. The slider writes to the store, and the existing subscription
carries it to the running graph.

## Decisions

**Unit: dB, −20…+20, step 1.** Matches Layer Two's slider and the units the store, engine and
exporter already speak, so there is no conversion layer and no rounding drift. 0 dB is unity, which
reads as a centred handle for "untouched". The row therefore carries two units — dB for level,
percent for the two sends — which is the same split every mixer makes.

**Scope: category-wide.** A pool row is a category, and in Layered mode a category may hold several
lanes. The row shows the first lane's level and writes to every lane of the category, exactly as
`setCategorySend` does today. Deliberately the coarser control; per-lane levels remain in Layer Two.

**Persistence: levels survive a redraw.** See below — this also fixes an existing defect.

## The persistence problem

`useRemix` calls `arrangementStore.initFrom(...)` on *every* change to the draw — Regenerate, a chip
click, a mode switch, a section switch. `initFrom` unconditionally rebuilds `tracks` (so `ceilingDb`
returns to 0 dB) and resets `trackSends` to the config defaults.

So today **a Rev or Dly move is silently discarded the moment you click a chip.** Volume inheriting
that would be worse, since level is the control you ride most.

### Fix

A level memory in `useRemix`: a `useRef<Record<trackId, {volumeDb?, reverb?, delay?}>>` that records
**only what you touched**. The effect that calls `initFrom` re-applies the remembered values
immediately afterwards, in the same effect body.

- **Ordering is deterministic** — `initFrom` and the restore are one effect, so no second render sits
  between them, and the engine's next reload (keyed on `trackKey`, which only changes after
  `initFrom` lands) builds its specs from the restored state.
- **Only touched values are recorded**, so an untouched category keeps its config default — MELODY
  stays at 75% / 30%.
- **Keyed on the `CATEGORY·ELEMENT` track id**, so a lane redrawn on the same element keeps your
  level and a lane drawn on a different element starts fresh. `generateRemix` already reasons about
  this id being stable across redraws, for mute.
- `initFrom` itself is **not** touched, so Layer Two's behaviour is unchanged.

`useRemix` gains `setCategoryVolume` and `setCategorySend`, moving that wiring out of `RemixView` —
it already owns your other hand-edits (`manual`).

## The control

```
MELODY 17   [ Earth·I  Water·I  … ]     Vol ──●──── 0 dB   Rev ─────● 75%   Dly ───●── 30%
BASS   10   [ Earth·I  Ether·I  … ]     Vol ─●───── -9 dB  Rev ●───── 0%    Dly ●───── 0%
```

A native `<input type="range">` styled like the two send sliders (`h-1 w-16`, accent
`var(--accent-ink)`), `min`/`max` from `config.audio.volume.trackMinDb`/`trackMaxDb`, `step={1}`,
readout `{db} dB` in a `w-12 tabular-nums` cell, `aria-label="Volume"` following the existing
`SEND_A11Y` convention. `TrackPoolRow` gains optional `volumeDb` / `onVolume` props mirroring
`sends` / `onSend`; omitting both renders no slider, as today.

Volume sits left of the sends: it is the primary control, and it matches ModuleDesigner's ordering.

−20 dB is quiet, not silent. Mute remains the way to remove a track, and remains what the export
filters on.

## Tests

1. `TrackPoolRow` renders a Volume slider at the current dB and reports the new dB on change.
2. `RemixView` writes a category's volume through to every lane of that category, and to no other.
3. A level set on a lane survives Regenerate (`PAD·FIRE` is authored by FIRE alone, so its id is
   stable across draws).
4. Sends survive a redraw too — the existing defect, now covered.
5. A level does not leak to a different element's lane (set under Scoped/WATER, absent under
   Scoped/FIRE).

## Out of scope

Per-lane volume on `/remix`; any mute or solo rework; any change to `initFrom` or Layer Two.
