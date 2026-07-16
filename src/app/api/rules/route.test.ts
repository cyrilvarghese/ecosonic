// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mkdtempSync, writeFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { GET, POST, PATCH } from '@/app/api/rules/route';

const candidate = {
  text: 'DRONE swells in around 3:00', layer: 'DRONE', sectionIndex: 1,
  structured: {
    category: 'DRONE',
    patch: { present: null, enter: { canon: 180, half: 30 }, exit: null, fadeIn: null, fadeOut: null, after: null },
  },
  evidence: [{ atSec: 180, note: 'swell' }], confidence: 0.9,
  kind: 'confirms', relatedRule: 'grammar:INTRODUCTION.DRONE.enter', mode: 'INTRODUCTION',
};
const jsonReq = (method: string, body: unknown) =>
  new Request('http://test/api/rules', {
    method, body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' },
  });

beforeEach(() => {
  const dir = mkdtempSync(path.join(tmpdir(), 'eco-api-'));
  const reg = path.join(dir, 'discovered-rules.json');
  const cfg = path.join(dir, 'ecosonic.config.json');
  writeFileSync(reg, '[]');
  copyFileSync(path.join(process.cwd(), 'config', 'ecosonic.config.json'), cfg);
  vi.stubEnv('ECOSONIC_RULES_PATH', reg);
  vi.stubEnv('ECOSONIC_CONFIG_PATH', cfg);
});

describe('/api/rules', () => {
  it('POST keeps a candidate; GET lists it', async () => {
    const post = await POST(jsonReq('POST', { candidate, source: { file: 't.mp3', model: 'm' } }));
    expect(post.status).toBe(201);
    const kept = await post.json();
    const list = await (await GET()).json();
    expect(list).toEqual([kept]);
  });
  it('POST rejects a malformed body', async () => {
    expect((await POST(jsonReq('POST', { nope: true }))).status).toBe(400);
  });
  it('PATCH discard removes; 404 when unknown id', async () => {
    const kept = await (await POST(jsonReq('POST', { candidate, source: { file: 't', model: 'm' } }))).json();
    expect((await PATCH(jsonReq('PATCH', { id: 'nope', action: 'discard' }))).status).toBe(404);
    expect((await PATCH(jsonReq('PATCH', { id: kept.id, action: 'discard' }))).status).toBe(200);
    expect(await (await GET()).json()).toEqual([]);
  });
  it('PATCH promote writes the grammar and flips status', async () => {
    const kept = await (await POST(jsonReq('POST', { candidate, source: { file: 't', model: 'm' } }))).json();
    const res = await PATCH(jsonReq('PATCH', { id: kept.id, action: 'promote' }));
    expect(res.status).toBe(200);
    const list = await (await GET()).json();
    expect(list[0].status).toBe('promoted');
  });
  it('PATCH promote 422s for a prose-only rule', async () => {
    const prose = { ...candidate, structured: null, kind: 'novel', relatedRule: null };
    const kept = await (await POST(jsonReq('POST', { candidate: prose, source: { file: 't', model: 'm' } }))).json();
    expect((await PATCH(jsonReq('PATCH', { id: kept.id, action: 'promote' }))).status).toBe(422);
  });
});
