// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GET, POST } from '@/app/api/analyze/route';

const analysisBody = {
  description: 'Opens on a noise floor…',
  sections: [{ startSec: 0, label: 'a' }, { startSec: 600, label: 'b' }, { startSec: 1200, label: 'c' }],
  observations: [{
    text: 'Pulsed tone enters ~1:15', layer: 'ISO', sectionIndex: 1,
    structured: {
      category: 'ISO',
      patch: { present: null, enter: { canon: 75, half: 15 }, exit: null, fadeIn: null, fadeOut: null, after: null },
    },
    evidence: [{ atSec: 75, note: 'pulse onset' }], confidence: 0.85,
  }],
};
const openAiOk = () => Promise.resolve(new Response(JSON.stringify({
  choices: [{ message: { content: JSON.stringify(analysisBody) } }],
}), { status: 200 }));

const upload = (name: string, type: string, bytes = 4) => {
  const form = new FormData();
  form.set('file', new File([new Uint8Array(bytes)], name, { type }));
  return new Request('http://test/api/analyze', { method: 'POST', body: form });
};

beforeEach(() => vi.unstubAllGlobals());

describe('/api/analyze', () => {
  it('GET reports readiness from the env', async () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    expect((await (await GET()).json()).ready).toBe(false);
    vi.stubEnv('OPENAI_API_KEY', 'k');
    expect((await (await GET()).json()).ready).toBe(true);
  });
  it('503 when the key is missing', async () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    expect((await POST(upload('t.mp3', 'audio/mpeg'))).status).toBe(503);
  });
  it('400 on wrong type and on oversize', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'k');
    expect((await POST(upload('t.ogg', 'audio/ogg'))).status).toBe(400);
    expect((await POST(upload('t.mp3', 'audio/mpeg', 26214401))).status).toBe(400);
  });
  it('happy path: classifies observations locally (ISO enter 75 confirms)', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'k');
    vi.stubGlobal('fetch', vi.fn(openAiOk));
    const res = await POST(upload('t.mp3', 'audio/mpeg'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.description).toContain('noise floor');
    const iso = body.candidates.find((c: { layer: string }) => c.layer === 'ISO');
    expect(iso.kind).toBe('confirms');
    expect(iso.relatedRule).toBe('grammar:INTRODUCTION.ISO.enter');
    // and the prompt sent to OpenAI stayed blind
    const sent = JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string);
    expect(sent.messages[0].content).not.toContain('540');
  });
  it('502 on upstream error and on malformed model output', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'k');
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('boom', { status: 500 }))));
    expect((await POST(upload('t.mp3', 'audio/mpeg'))).status).toBe(502);
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify({
      choices: [{ message: { content: '{"not":"analysis"}' } }],
    }), { status: 200 }))));
    expect((await POST(upload('t.mp3', 'audio/mpeg'))).status).toBe(502);
  });
});
