// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { GET, POST, DELETE } from '@/app/api/analyses/route';

const body = (fileName: string) => ({
  fileName, model: 'gpt-audio-1.5',
  windows: [{ mode: 'INTRODUCTION', description: 'opens on noise', sections: null, candidates: [] }],
});
const req = (method: string, url: string, json?: unknown) =>
  new Request(url, json === undefined
    ? { method }
    : { method, body: JSON.stringify(json), headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  const store = path.join(mkdtempSync(path.join(tmpdir(), 'eco-analyses-api-')), 'analyses.json');
  vi.stubEnv('ECOSONIC_ANALYSES_PATH', store);
});

describe('/api/analyses', () => {
  it('POST saves; GET lists metadata (no candidate payloads)', async () => {
    expect((await POST(req('POST', 'http://test/api/analyses', body('a.mp3')))).status).toBe(201);
    const list = await (await GET(req('GET', 'http://test/api/analyses'))).json();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ fileName: 'a.mp3', windowCount: 1, candidateCount: 0 });
    expect(list[0].windows).toBeUndefined();
  });
  it('GET ?file returns the full analysis; 404 when absent', async () => {
    await POST(req('POST', 'http://test/api/analyses', body('a.mp3')));
    const full = await (await GET(req('GET', 'http://test/api/analyses?file=a.mp3'))).json();
    expect(full.windows[0].description).toBe('opens on noise');
    expect((await GET(req('GET', 'http://test/api/analyses?file=missing.mp3'))).status).toBe(404);
  });
  it('DELETE removes; 404 when absent', async () => {
    await POST(req('POST', 'http://test/api/analyses', body('a.mp3')));
    expect((await DELETE(req('DELETE', 'http://test/api/analyses?file=a.mp3'))).status).toBe(200);
    expect((await DELETE(req('DELETE', 'http://test/api/analyses?file=a.mp3'))).status).toBe(404);
  });
  it('POST rejects a malformed body', async () => {
    expect((await POST(req('POST', 'http://test/api/analyses', { nope: true }))).status).toBe(400);
  });
});
