# Grammar Variants — promote accumulates, Generate draws any

**Status:** Approved design · **Date:** 2026-07-24 · **Branch:** `feat/three-pass-analysis`
**Related:** [rule-discovery page](./2026-07-15-rule-discovery-page-design.md) ·
[text-analysis](./2026-07-19-text-analysis-design.md) ·
[generation framework](../../generative/03-generation-framework.md)

---

## 1. Problem

Promoting a discovered rule **overwrites** the single grammar rule for its `(mode, category)`
(`promoteRule` merges the patch into `layerTwo.generation.modeRules[mode][category]` and rewrites
`config/ecosonic.config.json`). Three problems follow:

1. **Overwrite, not accumulate.** Each reference you promote *destroys* the previous rule for that
   layer. You can only ever hold one truth per `(mode, category)` — but real references legitimately
   disagree, and the point of the `/rules` workshop is to *learn* that spread, not collapse it.
2. **Never visible at runtime.** `config.ts` does `import raw from '../config/ecosonic.config.json'`
   and parses it **once** at module load. The Live-grammar panel (`grammarSpans`/`grammarRows`), the
   grammar timeline, and the Generate button (`generateModeTemplate(…, config)`) all read that frozen
   singleton. A promote writes disk but nothing re-reads it, so the panel and Generate keep showing
   the old value — it *looks* like the promote didn't persist even though it did (verified: a promote
   left `INTRODUCTION.NOISE.fadeIn.canon 60→0` on disk, valid, unread by the app).
3. **Git-noise.** `promoteRule` writes with `JSON.stringify(cfg, null, 2)`, re-pretty-printing the
   compact committed config — a single promote produced a ~715-line reformatting diff on a
   git-tracked file.

**Goal:** promote should **append** the reference's pattern as an *additional allowed variant* of that
layer's arrangement, so a layer accumulates a pool of legal shapes learned from real tracks, and
Generate can draw *any* of them (drift-gated). Variants live in their own runtime-read store, which
also makes promotes visible live and stops clobbering the committed seed.

## 2. Solution overview

The grammar stops being *one rule per `(mode, category)`* and becomes *a pool of variants per
`(mode, category)`*. The committed `ecosonic.config.json` stays frozen as the **seed** (variant 0,
always the brief). Promoted references are appended to a new `config/grammar-variants.json`, read
fresh at runtime and served to the client.

```
Promote ─▶ build variant (seed ⊕ patch) ─▶ invariant gate ─▶ append to grammar-variants.json
                                                                     │  (seed config untouched)
   GET /api/grammar (nodejs) reads seed + variants FRESH from disk ──┘
                     │
   client fetches on mount + after promote/discard
        ├─▶ "Live grammar" panel renders the live pools  (MELODY (3) …)
        └─▶ arrangementStore.generateModule → generateModeTemplate(…, variants)
                     │
   Selection (drift-gated):
        STRICT       → seed rule only          (brief-faithful; variant-only layers skipped)
        MODERATE/EXP → seeded pick across pool  → then draw ±half×drift within the chosen variant
```

Because the client now *fetches* live grammar instead of reading the frozen import, a promote shows
up immediately — no restart, no rebuild. The static `config` import remains only as the seed source.

## 3. Data model — `config/grammar-variants.json`

```jsonc
{
  "INTRODUCTION":    { "MELODY": [ { "id": "…", "source": { "file": "…", "date": "…", "model": "…" },
                                     "rule": { /* complete GenLayerRule */ } } ] },
  "DEEP_RELAXATION": { },
  "RETURN":          { }
}
```

- Keyed `mode → category → Variant[]`. A missing mode/category key = empty pool.
- Each `variant.rule` is a **complete** `GenLayerRule` (the schema already in `config.ts`:
  `{ present, enter:{canon,half}, exit, fadeIn, fadeOut, after? }`, `exit` = GenRange | `'MODULE_END'`).
- `variant.id` **equals the discovered-rule registry id** — so discard removes both by one id.
- New Zod `GrammarVariantsSchema`. To validate `rule`, **export `GenLayerRuleSchema` from `config.ts`**
  (today only the `GenLayerRule` type is exported). Tolerant read: missing file →
  `{ INTRODUCTION:{}, DEEP_RELAXATION:{}, RETURN:{} }`.

## 4. Variant construction — seed ⊕ patch

A promoted patch (`PatchWireT`) is often partial. Build a complete, coherent variant:

- Start from the seed `GenLayerRule` for `(mode, category)` if one exists; else start empty.
- Overlay the patch's **non-null** fields (`stripNulls`, as `promoteRule` does today):
  `present, enter, exit, fadeIn, fadeOut, after`.
- The result must validate against `GenLayerRuleSchema`. A partial patch into a layer **absent** from
  the seed (no base to complete from) yields an incomplete rule → validation fails → 422 with the
  existing "absent layer needs full timings" message.

So promoting a MELODY observation that only pins `enter=390` yields a full MELODY variant that is
canonical everywhere except `enter` — never a half-specified rule that generates garbage.

## 5. Selection — drift-gated, seeded

New module `src/rules/grammarPool.ts`:

```ts
seedRuleFor(mode, cat, cfg): GenLayerRule | undefined   // cfg.layerTwo.generation.modeRules[mode][cat]
poolFor(mode, cat, cfg, variants): GenLayerRule[]        // compact([seed, ...variantRules])
```

`generateModeTemplate` gains a `variants` argument (the variants map; default `{}` = today's
behavior). Per category, in the existing bottom-up loop:

- **STRICT:** use `seedRuleFor(...)` only. If undefined (variant-only layer), **skip** the layer —
  STRICT stays strictly brief-faithful. **No extra RNG draw is consumed under STRICT**, so STRICT
  output is byte-identical to today.
- **MODERATE / EXPLORATORY:** `pool = poolFor(...)`; if empty, skip; else `chosen = rng.pick(pool)`
  (uniform, seeded). A pool of one behaves exactly as today.
- Then draw within `chosen` via `sampleRange` exactly as now, and R2 ordering / bounds clamping
  (steps 2–3) are unchanged.

`generateComposition` forwards the same `variants` argument. Reproducibility holds: same seed + same
variants map ⇒ same draw.

> **RNG note:** adding a per-layer `rng.pick` under MODERATE/EXPLORATORY shifts the RNG stream vs.
> the pre-change generator, so a given seed maps to a different (still deterministic) MODERATE/EXP
> arrangement than before. STRICT is unaffected. This is acceptable — seeds are opaque — and called
> out so the generator tests are updated deliberately, not "fixed" blindly.

## 6. Runtime wiring

**Server — `src/rules/grammarVariants.ts`** (mirrors `registry.ts`):
`readVariants(path?)`, `appendVariant(mode, cat, variant, path?)`, `removeVariant(id, path?)`.
Path via `ECOSONIC_VARIANTS_PATH ?? path.join(process.cwd(), 'config', 'grammar-variants.json')`.

**`/api/grammar` route (`runtime = 'nodejs'`):** `GET` → `readVariants()` (the client already holds
the seed via the static `config` import; only the *additions* travel the wire).

**Client:**
- `RulesPage` and the arrangement store fetch `/api/grammar` on mount and re-fetch after a successful
  promote/discard PATCH.
- `RuleLibrary` grammar panel: `grammarRows`/`grammarSpans` extended to accept the variants map and
  surface pools — a `MELODY (3)` count plus the variant list under each layer. Seed row always
  present; variant rows tinted.
- `arrangementStore.generateModule`: pass the fetched variants into
  `generateModeTemplate(s.tracks, s.activeMode, s.drift, genSeed++, config, variants)`.

## 7. Promote / discard lifecycle + invariant gate

**`/api/rules` PATCH `action:'promote'`** (replaces the `promoteRule`/config-write path):
1. Build the variant rule (seed ⊕ patch, §4).
2. **Invariant gate.** Force-select the candidate variant and test-generate `generateModeTemplate`
   for `mode` across **N=8 seeds** at MODERATE drift over a **synthetic canonical track set** (one
   track per category present in the mode's pool, always incl. NOISE — `validateTemplate` only needs
   trackId→category). Accept only if **every** run passes I1–I6; else **422** with the first
   `Violation.message`. Generator gains an optional `pin?: Partial<Record<Category, GenLayerRule>>`
   that forces the chosen rule **and its presence** for given categories, bypassing both variant
   selection and the presence coin-flip — the gate pins the candidate so it is always included.
3. On pass: `appendVariant(...)` (dedupe: a structurally-identical rule already in the pool is a
   no-op) and `setStatus(id, 'promoted')`. **Do not** touch `ecosonic.config.json`.

**Discard** of a promoted rule: `removeRule(id)` (registry) **and** `removeVariant(id)` — same id,
so the pooled variant leaves with its registry entry.

Consequence of the gate (by design): a **driver** variant (PAD/BASS/ARP/MELODY/FX) into
**DEEP_RELAXATION** always fails **I4** and is rejected; a **non-driver** addition the seed omits
(e.g. **DRONE**, ELEMENT_SUB) is accepted iff I1–I6 hold. This honors "any variation is allowed" *up
to the brief's hard invariants*; overriding I4 itself is explicitly out of scope (§10).

## 8. Config / schema changes

- `config.ts`: **export `GenLayerRuleSchema`** (currently an internal `const`; it already composes
  the internal `GenRangeSchema`/`ExitSpecSchema`, so exporting the one is enough) for reuse.
- New `GrammarVariantsSchema` + `Variant`/`GrammarVariants` types (in `analysisSchema.ts` or a new
  `src/rules/grammarVariants.ts`).
- `generateModeTemplate` / `generateComposition` signatures gain `variants` (+ generator `pin`).
- **Migration:** the working tree's `ecosonic.config.json` carries the old overwrite-promotes
  (`INTRODUCTION.{NOISE,ELEMENT}.fadeIn` zeroed). Revert it to `HEAD` so the seed is clean; those
  patterns can be re-promoted as variants. Behaviour with no `grammar-variants.json` is identical to
  today (empty pools).

## 9. UI changes (minimal, v1)

- Grammar panel shows per-layer variant count + list (seed vs promoted tinting). No new page.
- `CandidateCard` / `RuleLibrary`: promote copy stays "Promote"; its effect is now *append*, not
  overwrite. Optional inline "n variants" affordance.

## 10. Out of scope (v1) / known limits

- **Overriding invariants.** Variants respect I1–I6; relaxing I4 (drivers in Deep Relaxation) is a
  separate, larger decision.
- **Negative-canon bridging variants.** The grammar domain is `[0,D]` (`GenRangeSchema` is
  non-negative), so a bridging `enter.canon < 0` cannot be promoted. (The analysis wire allows it;
  `match.ts` clamps for comparison — see the 2026-07-24 negative-position fix.)
- **Exhaustive cross-variant checking.** The gate validates each new variant *in isolation* against
  seed defaults; template-wide invariants (e.g. I3 density) that depend on *which other* variants are
  co-selected are not exhaustively enumerated. Relies on per-draw generation being well-behaved.
- **Session-scale composition UI**, **confidence-weighted selection**, and **per-variant editing** —
  all deferred.

## 11. Testing

- **`grammarVariants` store:** append/read/remove round-trip; dedupe; missing file → empty pools;
  `ECOSONIC_VARIANTS_PATH` honored.
- **Variant construction:** seed ⊕ partial patch → complete valid rule; partial patch into an
  absent-seed layer → validation error.
- **Selection (`generateModeTemplate`):** STRICT with variants present → seed-only, byte-identical to
  the no-variants draw; pool of one → unchanged; MODERATE/EXP → can select a promoted variant,
  reproducibly by seed; `pin` forces a category's rule.
- **Invariant gate:** MELODY→DEEP_RELAXATION rejected (I4); DRONE→DEEP_RELAXATION accepted; a variant
  that breaks I1/I5 rejected with the right code.
- **`/api/grammar`:** GET returns the variants map. **`/api/rules` PATCH promote:** appends a variant,
  flips status to `promoted`, does NOT modify `ecosonic.config.json`, 422s on gate failure; discard
  removes the variant.
- **Integration:** promote → GET `/api/grammar` reflects it → `generateModeTemplate(…, variants)` can
  draw it under EXPLORATORY.
