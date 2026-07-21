import { config } from '@/config';
import { TextAnalysisSchema, OPENAI_TEXT_ANALYSIS_JSON_SCHEMA } from '@/rules/analysisSchema';
import { buildTextPrompt } from '@/rules/inventory';
import { classifyObservations } from '@/rules/match';

export const runtime = 'nodejs';

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const MAX_TEXT = 20000;

export async function POST(req: Request) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return Response.json({ error: 'OPENAI_API_KEY is not set — add it to .env.local' }, { status: 503 });
  }
  const body = (await req.json().catch(() => null)) as { text?: unknown; name?: unknown } | null;
  const text = typeof body?.text === 'string' ? body.text.trim() : '';
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!text) return Response.json({ error: 'text field required' }, { status: 400 });
  if (text.length > MAX_TEXT) return Response.json({ error: `text exceeds ${MAX_TEXT} characters` }, { status: 400 });
  if (!name) return Response.json({ error: 'name field required' }, { status: 400 });

  const res = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.analysis.textModel,
      messages: [
        { role: 'system', content: buildTextPrompt() }, // blind
        { role: 'user', content: text },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'text_analysis', strict: true, schema: OPENAI_TEXT_ANALYSIS_JSON_SCHEMA },
      },
    }),
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 300);
    return Response.json({ error: `OpenAI ${res.status}: ${detail}` }, { status: 502 });
  }

  const payload = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = payload.choices?.[0]?.message?.content ?? '';
  let parsed;
  try {
    parsed = TextAnalysisSchema.parse(JSON.parse(content));
  } catch (err) {
    console.error('[analyze-text] malformed analysis — raw reply:\n', content);
    console.error('[analyze-text] parse/validation error:\n', err);
    return Response.json({ error: 'model returned a malformed analysis' }, { status: 502 });
  }
  return Response.json(parsed.windows.map((w) => ({
    mode: w.mode,
    description: w.description,
    sections: w.sections,
    candidates: classifyObservations(w, w.mode),
  })));
}
