import { config as defaultConfig, type EcosonicConfig } from '@/config';
import type { Bridge, Mode, ModuleInstance } from '@/arrange/types';

export function buildSequence(
  totalSecTarget: number,
  cfg: EcosonicConfig = defaultConfig,
): { sequence: ModuleInstance[]; bridges: Bridge[]; totalSec: number } {
  const { moduleSeconds: M, bridgeSeconds: B, modes } = cfg.layerTwo;
  const n = Math.max(1, Math.round(totalSecTarget / M));

  const sequence: ModuleInstance[] = [];
  for (let i = 0; i < n; i++) {
    sequence.push({
      id: `mod-${i}`,
      mode: modes[i % modes.length] as Mode,
      startSec: i * (M - B),
      durationSec: M,
    });
  }

  const bridges: Bridge[] = [];
  for (let i = 0; i < n - 1; i++) {
    bridges.push({
      id: `bridge-${i}`,
      fromInstanceId: sequence[i].id,
      toInstanceId: sequence[i + 1].id,
      overlapSec: B,
    });
  }

  const totalSec = n * M - (n - 1) * B;
  return { sequence, bridges, totalSec };
}
