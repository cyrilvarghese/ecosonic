import { config as defaultConfig, type EcosonicConfig } from '@/config';
import type { Category } from '@/types';
import type { ArrTrack, ModeTemplate, TemplateRegion } from '@/arrange/types';
import { STACK_ORDER } from '@/arrange/types';

export interface Violation { code: string; message: string }

const DRIVERS: Category[] = ['PAD', 'BASS', 'ARP', 'MELODY', 'FX'];

/** True if `nums` rises (non-decreasing) then falls (non-increasing) — a single density peak. */
function isUnimodal(nums: number[]): boolean {
  let i = 0;
  while (i + 1 < nums.length && nums[i + 1] >= nums[i]) i++;
  while (i + 1 < nums.length && nums[i + 1] <= nums[i]) i++;
  return i === nums.length - 1;
}

/** Check a template against the brief's invariants (I1–I6). Pure oracle: repairs live in the
 *  generator, this only reports. `tracks` maps region trackId → category. */
export function validateTemplate(
  template: ModeTemplate,
  tracks: ArrTrack[],
  cfg: EcosonicConfig = defaultConfig,
): { ok: boolean; violations: Violation[] } {
  const D = cfg.layerTwo.moduleSeconds;
  const catOf = new Map(tracks.map((t) => [t.id, t.category]));
  const regions = template.regions;
  const v: Violation[] = [];
  const catOfRegion = (r: TemplateRegion) => catOf.get(r.trackId);

  // I1 — continuity: a NOISE region exists; in Introduction/Return it spans [0, D].
  const noise = regions.filter((r) => catOfRegion(r) === 'NOISE');
  if (noise.length === 0) {
    v.push({ code: 'I1_CONTINUITY', message: 'no NOISE (continuity bed) present' });
  } else if (template.mode !== 'DEEP_RELAXATION' && !noise.some((r) => r.enterSec === 0 && r.exitSec === D)) {
    v.push({ code: 'I1_CONTINUITY', message: 'NOISE does not span the module' });
  }

  // I2 — bottom-up order: earliest enter per category is non-decreasing up the stack.
  const earliest = new Map<Category, number>();
  for (const r of regions) {
    const c = catOfRegion(r);
    if (!c) continue;
    earliest.set(c, Math.min(earliest.get(c) ?? Infinity, r.enterSec));
  }
  const present = STACK_ORDER.filter((c) => earliest.has(c));
  for (let i = 1; i < present.length; i++) {
    if (earliest.get(present[i])! < earliest.get(present[i - 1])! - 1e-6) {
      v.push({ code: 'I2_ORDER', message: `${present[i]} enters before ${present[i - 1]}` });
    }
  }

  // I3 — single-peaked density.
  const counts: number[] = [];
  for (let s = 1; s < D; s += 5) counts.push(regions.filter((r) => s > r.enterSec && s < r.exitSec).length);
  if (!isUnimodal(counts)) v.push({ code: 'I3_ARCH', message: 'density is not single-peaked' });

  // I4 — mode constraints: no drivers in Deep Relaxation.
  if (template.mode === 'DEEP_RELAXATION') {
    for (const r of regions) {
      const c = catOfRegion(r);
      if (c && DRIVERS.includes(c)) v.push({ code: 'I4_MODE', message: `${c} present in DEEP_RELAXATION` });
    }
  }

  // I5 — bounds: 0 ≤ enter < exit ≤ D and fades fit the clip.
  for (const r of regions) {
    if (r.enterSec < 0 || r.exitSec > D || r.enterSec >= r.exitSec) {
      v.push({ code: 'I5_BOUNDS', message: `region ${r.trackId} out of bounds` });
    }
    if (r.fadeInSec + r.fadeOutSec > r.exitSec - r.enterSec + 1e-6) {
      v.push({ code: 'I5_BOUNDS', message: `region ${r.trackId} fades exceed width` });
    }
  }

  // I6 — no silent gap: ≥1 region active at every sampled instant.
  for (let s = 1; s < D; s += 5) {
    if (!regions.some((r) => s > r.enterSec && s < r.exitSec)) {
      v.push({ code: 'I6_GAP', message: `silence at ${s}s` });
      break;
    }
  }

  return { ok: v.length === 0, violations: v };
}
