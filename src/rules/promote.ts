import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ConfigSchema } from '@/config';
import type { Mode } from '@/arrange/types';
import type { PatchWireT } from '@/rules/analysisSchema';

const defaultPath = (): string =>
  process.env.ECOSONIC_CONFIG_PATH ?? path.join(process.cwd(), 'config', 'ecosonic.config.json');

/** Drop null wire fields — what remains is the actual grammar patch. */
function stripNulls(patch: PatchWireT): Record<string, unknown> {
  return Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== null));
}

/** The ONLY code path that writes into the live grammar. All-or-nothing:
 *  merge → validate the ENTIRE config → write; any failure leaves the file untouched. */
export function promoteRule(
  input: { mode: Mode; category: string; patch: PatchWireT },
  configPath: string = defaultPath(),
): { ok: true } | { ok: false; reason: string } {
  let cfg: unknown;
  try {
    cfg = JSON.parse(readFileSync(configPath, 'utf8'));
  } catch (e) {
    return { ok: false, reason: `config unreadable: ${(e as Error).message}` };
  }
  const modeRules = (cfg as {
    layerTwo?: { generation?: { modeRules?: Record<string, Record<string, unknown>> } };
  }).layerTwo?.generation?.modeRules?.[input.mode];
  if (!modeRules) return { ok: false, reason: `no generation rules for mode ${input.mode}` };

  const clean = stripNulls(input.patch);
  if (Object.keys(clean).length === 0) return { ok: false, reason: 'patch is empty' };
  const existing = modeRules[input.category] as Record<string, unknown> | undefined;
  modeRules[input.category] = existing ? { ...existing, ...clean } : clean;

  const parsed = ConfigSchema.safeParse(cfg);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      ok: false,
      reason: `merged config invalid at ${first.path.join('.')}: ${first.message}` +
        (existing ? '' : ' — promoting into a mode where the layer is absent needs full timings'),
    };
  }
  writeFileSync(configPath, JSON.stringify(cfg, null, 2) + '\n');
  return { ok: true };
}
