import { describe, it, expect, vi } from 'vitest';

vi.mock('@/arrange/render/renderModuleWav', () => ({
  renderModuleToWav: vi.fn(async (_args, cfg) => new Blob([String(cfg.layerTwo.moduleSeconds)])),
}));

import { renderModuleToWav } from '@/arrange/render/renderModuleWav';
import { exportFreeMixWav } from './renderFreeMix';

describe('exportFreeMixWav', () => {
  it('renders one module sized to totalSec', async () => {
    await exportFreeMixWav({ tracks: [], regions: [], totalSec: 1800, masterDb: 0 });
    const mock = renderModuleToWav as unknown as { mock: { calls: unknown[][] } };
    const cfgArg = mock.mock.calls[0][1] as { layerTwo: { moduleSeconds: number } };
    expect(cfgArg.layerTwo.moduleSeconds).toBe(1800);
  });
});
