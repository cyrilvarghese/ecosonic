# Architecture Decision Records

Each ADR captures one significant, hard-to-reverse decision: its context, the decision, and the
consequences. Format is lightweight (Michael Nygard style). Newest decisions supersede older ones
explicitly.

Related: [PRD](../PRD.md) · [SPEC](../SPEC.md)

| # | Decision | Status |
|---|---|---|
| [0001](./0001-density-is-the-arrangement.md) | Density *is* the arrangement — no global volume envelope | Accepted |
| [0002](./0002-clips-control-playback-not-gain.md) | Clips control playback (trigger/release), not gain | Accepted |
| [0003](./0003-sample-accurate-scrubbing.md) | Sample-accurate scrubbing via offset trigger | Accepted |
| [0004](./0004-mode-rules-as-config-data.md) | Mode rules live in config as a tunable density table | Accepted |
| [0005](./0005-single-module-first.md) | Build the single-module designer first; park the composition engine | Accepted |
| [0006](./0006-reuse-layer-one-audio-engine.md) | Reuse the Layer One AudioEngine with per-track trigger/release | Accepted |
