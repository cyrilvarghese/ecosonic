# ECOSONIC — Layer One UI Enhancements

A set of interface refinements to the **Layer One sound-ecosystem builder** — the
multitrack screen where each generative audio track gets a live waveform, a
playhead, and its own volume control. The goal across all four changes was to make
the interface *feel* like an audio tool: expressive metering, musician-friendly
gain, and clear playback feedback.

Built on the `feat/layer-one-core` branch. Every change is covered by the test
suite (`npm run test`) and passes a strict TypeScript check (`npx tsc --noEmit`).

| # | Enhancement | In one line |
|---|-------------|-------------|
| 1 | Centered ±20 dB volume | Per-track fader now boosts *and* cuts, with unity (0 dB) at the center |
| 2 | Expressive analyser | Quiet streams are boosted with soft saturation so the waveform actually moves |
| 3 | Circular playhead | The position marker became a clean filled dot instead of a hard bar |
| 4 | Progress trail | The played portion of each lane fills with a light gradient as it plays |

---

## 1 · Centered ±20 dB volume fader

**Problem.** The track fader ran `−60 dB → 0 dB` — attenuation only. `0 dB` meant
"source level" and sat pinned at the far right, so there was no way to push a track
*above* unity, and the control read like a mute-to-full slider rather than a mixer
channel.

**Solution.** Each track fader now spans **`−20 dB … +20 dB` with unity (0 dB)
centered**, giving symmetric boost and cut — the mental model of a real mixing
console. New tracks default to `0 dB` so the knob starts centered.

**The subtle part — decoupling "silence" from "slider minimum."** Gain is computed
by:

```ts
dbToGain(db, minDb) = db <= minDb ? 0 : 10 ** (db / 20)
```

That hard-zero at `minDb` exists because for the **master** bus, `minDb` (−60) *is*
the silence floor. If the track fader simply reused `minDb` as its minimum, the
bottom of the fader would snap to true silence. But `−20 dB` should be a genuinely
quiet level — `10 ** (−20/20) = 0.1`, i.e. 10 % amplitude — not off.

So the silence floor was kept separate from the fader range: `minDb`/`maxDb` (−60/0)
stay the **master range and silence floor**, while new `trackMinDb`/`trackMaxDb`
(−20/+20) drive the **track fader**. Track values clamp to `≥ −20`, so they can
never reach the −60 floor. The bottom of the track fader is a real −20 dB; **true
silence stays the job of the mute button.**

`+20 dB` is a genuine 10× linear boost that *can* clip loud material — this was left
un-limited on purpose, honoring the request for real headroom rather than a cosmetic
range.

**Files:** [`config/ecosonic.config.json`](../config/ecosonic.config.json) ·
[`src/config.ts`](../src/config.ts) ·
[`src/session/sessionStore.ts`](../src/session/sessionStore.ts) ·
[`src/components/TrackLane.tsx`](../src/components/TrackLane.tsx)

---

## 2 · Expressive analyser (soft-saturated visual gain)

**Problem.** The per-track oscilloscope maps the analyser's `[-1, 1]` samples
straight to pixels. Ambient, quiet source material barely nudges the line off
center, so most lanes looked like flat wires — you couldn't *see* the audio.

**Solution.** A **visual gain** is applied before drawing, shaped by `tanh` for soft
saturation:

```ts
displayAmp = tanh(amp * gain)          // gain ≈ 3.2
y = h/2 + displayAmp * (h/2) * 0.9
```

`tanh` boosts small amplitudes so faint signals become legible, while peaks compress
smoothly toward the lane edge instead of clipping flat against it — the visual
equivalent of makeup gain with a gentle limiter.

**Refactor along the way.** The `y = h/2 + amp*(h/2)*0.9` line was copy-pasted in two
places: the per-track canvas visualizer and the master p5.js visualizer. Both now
call a single shared helper, `amplitudeToY(amp, h, gain)`, with the gain exposed as a
tunable `WAVEFORM_VISUAL_GAIN` constant — one place to dial the whole app's metering.

**Files:** [`src/audio/waveform.ts`](../src/audio/waveform.ts) (helper + tests) ·
[`src/components/LaneVisualizer.tsx`](../src/components/LaneVisualizer.tsx) ·
[`src/components/Visualizer.tsx`](../src/components/Visualizer.tsx)

---

## 3 · Circular playhead

**Problem.** The playhead was a `2px` full-height filled rectangle — functional, but
visually heavy and at odds with the soft, organic aesthetic of the waveforms.

**Solution.** A **filled circle** (radius ≈ 4 px) rides the lane's mid-line at the
playback position, drawn last so it sits on top of the trace. A thin
`rgba(255,255,255,0.85)` ring keeps the dot legible exactly where it crosses the
same-colored waveform line.

**Files:** [`src/components/LaneVisualizer.tsx`](../src/components/LaneVisualizer.tsx)

---

## 4 · Progress trail

**Problem.** Nothing distinguished the *played* portion of a loop from what was still
to come — the playhead told you *where*, but not *how far*.

**Solution.** The region from the left edge to the playhead fills with a **light
gradient in the element's accent tint that brightens toward the dot**, growing as the
loop plays and resetting each cycle:

```ts
const grad = g.createLinearGradient(0, 0, playedX, 0);
grad.addColorStop(0, `rgba(${fillR}, ${fillG}, ${fillB}, 0)`);   // transparent at loop start
grad.addColorStop(1, `rgba(${fillR}, ${fillG}, ${fillB}, 0.3)`); // light accent at the playhead
g.fillStyle = grad;
g.fillRect(0, 0, playedX, h);
```

Three implementation notes that made this clean:

- **Draw order is the trick.** The progress computation was hoisted above the
  waveform so the gradient paints *first* — the oscilloscope line and the dot then
  render on top of it, staying fully visible *through* the translucent fill rather
  than being hidden by it.
- **Light vs. ink from the design system.** The fill uses the element's light tint
  (`--accent`, L≈0.8) at ~30 % alpha, while the waveform keeps the darker `--accent-ink`
  — so the trace reads clearly against its own progress trail.
- **oklch → sRGB bytes for a translucent gradient.** The palette is oklch, and for
  these wide-gamut tints the browser hands back a `lab(...)`/`oklch(...)` string —
  concatenating an alpha onto that throws `addColorStop` (a real bug caught in
  testing). The robust fix: paint the resolved color onto a **1×1 scratch canvas and
  read it back with `getImageData`**, which is always 8-bit sRGB, then build proper
  `rgba()` stops from those channels. The gradient is anchored to the playhead
  (`createLinearGradient(0,0,playedX,0)`), so it rescales toward the moving dot each
  frame with no per-frame color math, and the color re-resolves on theme changes.

**Files:** [`src/components/LaneVisualizer.tsx`](../src/components/LaneVisualizer.tsx)

---

## Cross-cutting design choices

- **Theme-aware canvas.** All canvas drawing resolves the live CSS accent variable
  (re-read periodically) so waveform, playhead, and trail follow the per-element
  color theme through hot-reloads and element switches.
- **Config-driven, not magic numbers.** Gain ranges and defaults live in
  `ecosonic.config.json` behind a Zod schema that validates at startup; the visual
  gain lives in one named constant. Tuning the feel never means hunting through
  components.
- **DRY under pressure.** Where a change touched duplicated logic (the amplitude
  mapping), the duplication was collapsed into a shared, tested helper rather than
  edited in two spots.

## Verification

```
npx tsc --noEmit     # clean
npm run test         # 12 files, 44 tests passing
```

New/updated coverage: unit tests for `amplitudeToY` (center, boost, soft-saturation
clamp, symmetry) and an updated volume-clamp test asserting the track range
(`±20 dB`) and master range (`−60…0 dB`) independently.
