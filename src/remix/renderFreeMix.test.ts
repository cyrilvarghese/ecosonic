import { describe, it, expect, vi } from 'vitest';

vi.mock('@/arrange/render/renderModuleWav', () => ({
  renderModuleToWav: vi.fn(async (_args, cfg) => new Blob([String(cfg.layerTwo.moduleSeconds)])),
}));

import { renderModuleToWav } from '@/arrange/render/renderModuleWav';
import { estimatedWavBytes, exportFreeMixWav } from './renderFreeMix';

describe('exportFreeMixWav', () => {
  it('renders one module sized to totalSec', async () => {
    await exportFreeMixWav({ tracks: [], regions: [], totalSec: 1800, masterDb: 0 });
    const mock = renderModuleToWav as unknown as { mock: { calls: unknown[][] } };
    const cfgArg = mock.mock.calls[0][1] as { layerTwo: { moduleSeconds: number } };
    expect(cfgArg.layerTwo.moduleSeconds).toBe(1800);
  });

  it('passes sends through to the module renderer', async () => {
    const sends = { a: { reverb: 0.5, delay: 0.1 } };
    await exportFreeMixWav({ tracks: [], regions: [], totalSec: 1800, masterDb: 0, sends });
    const mock = renderModuleToWav as unknown as { mock: { calls: unknown[][] } };
    const last = mock.mock.calls[mock.mock.calls.length - 1][0] as { sends?: unknown };
    expect(last.sends).toEqual(sends);
  });
});

describe('estimatedWavBytes', () => {
  it('counts the effect tail the renderer appends past the timeline', () => {
    expect(estimatedWavBytes(100)).toBeGreaterThan(Math.round(100 * 44100 * 2 * 2) + 44);
  });
});
