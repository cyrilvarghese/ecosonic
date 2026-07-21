// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { POST } from '@/app/api/analyze-text/route';

const analysis = {
  windows: [
    {
      mode: 'INTRODUCTION',
      description: 'Opens on a noise bed; ISO enters ~1:15.',
      sections: null,
      observations: [{
        text: 'ISO fades in around 1:15', layer: 'ISO', sectionIndex: null,
        structured: { category: 'ISO', patch: { present: null, enter: { canon: 75, half: 10 }, exit: null, fadeIn: null, fadeOut: null, after: null } },
        evidence: [{ atSec: 75, note: 'ISO begins' }], confidence: 0.9,
      }],
    },
    { mode: 'DEEP_RELAXATION', description: 'Bed only.', sections: null, observations: [] },
    { mode: 'RETURN', description: 'Rebuilds then fades.', sections: null, observations: [] },
  ],
};
const openAiOk = () => Promise.resolve(new Response(JSON.stringify({
  choices: [{ message: { content: JSON.stringify(analysis) } }],
}), { status: 200 }));
const req = (body: unknown) => new Request('http://test/api/analyze-text', {
  method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' },
});

beforeEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('/api/analyze-text', () => {
  it('returns one classified window per mode', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'k');
    vi.stubGlobal('fetch', vi.fn(openAiOk));
    const out = await (await POST(req({ text: 'A written description…', name: 't.txt' }))).json();
    expect(out.map((w: { mode: string }) => w.mode)).toEqual(['INTRODUCTION', 'DEEP_RELAXATION', 'RETURN']);
    const iso = out[0].candidates.find((c: { structured?: { category: string } }) => c.structured?.category === 'ISO');
    expect(iso.kind).toBe('confirms');
    expect(iso.relatedRule).toBe('grammar:INTRODUCTION.ISO.enter');
  });
  it('sends the configured text model and strict json_schema', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'k');
    vi.stubGlobal('fetch', vi.fn(openAiOk));
    await POST(req({ text: 'x', name: 'n' }));
    const sent = JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string);
    expect(sent.model).toBe('gpt-5.6-luna');
    expect(sent.response_format.json_schema.strict).toBe(true);
  });
  it('503 without a key, 400 on empty text, 400 on empty name', async () => {
    expect((await POST(req({ text: 'x', name: 'n' }))).status).toBe(503);
    vi.stubEnv('OPENAI_API_KEY', 'k');
    expect((await POST(req({ text: '   ', name: 'n' }))).status).toBe(400);
    expect((await POST(req({ text: 'x', name: '' }))).status).toBe(400);
  });
  it('502 on a malformed model reply', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'k');
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify({
      choices: [{ message: { content: '{"nope":true}' } }],
    }), { status: 200 }))));
    expect((await POST(req({ text: 'x', name: 'n' }))).status).toBe(502);
  });
});
