import { describe, it, expect, vi, afterEach } from 'vitest';
import { loadSessionStore } from '@/sessions';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('loadSessionStore, locally', () => {
  it('reads the authored sessions from the API route', async () => {
    const body = { store: { EARTH: [{ id: 'earth-1' }] }, warnings: ['w'] };
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => body }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(loadSessionStore()).resolves.toEqual(body);
    expect(fetchMock).toHaveBeenCalledWith('/api/sessions');
  });

  it('throws with the status when the route fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })));

    await expect(loadSessionStore()).rejects.toThrow('500');
  });
});

describe('loadSessionStore, hosted', () => {
  it('uses the baked store and never touches the network', async () => {
    // A static export has no /api/sessions. Reaching for it would 404, which is the bug this seam
    // exists to prevent — so the assertion that matters is that fetch is not called at all.
    const fetchMock = vi.fn(async () => { throw new Error('must not fetch when hosted'); });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('NEXT_PUBLIC_STATIC_EXPORT', 'true');

    const { store, warnings } = await loadSessionStore();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(Object.keys(store)).toEqual(['EARTH', 'WATER', 'AIR', 'FIRE', 'ETHER']);
    expect(Array.isArray(warnings)).toBe(true);
  });

  it('bakes in every authored session, so the pool is not silently empty', async () => {
    vi.stubEnv('NEXT_PUBLIC_STATIC_EXPORT', 'true');

    const { store } = await loadSessionStore();

    const rules = Object.values(store).flatMap((docs) => docs.flatMap((d) => d.rules));
    expect(Object.values(store).flat()).toHaveLength(5);
    expect(rules.length).toBeGreaterThan(50);
  });
});
