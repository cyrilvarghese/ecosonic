import { config } from '@/config';
import { AnalysisResultSchema, MODES, OPENAI_ANALYSIS_JSON_SCHEMA } from '@/rules/analysisSchema';
import { buildSystemPrompt } from '@/rules/inventory';
import { classifyObservations } from '@/rules/match';

export const runtime = 'nodejs';

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

export async function GET() {
  return Response.json({ ready: Boolean(process.env.OPENAI_API_KEY) });
}

export async function POST(req: Request) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return Response.json({ error: 'OPENAI_API_KEY is not set — add it to .env.local' }, { status: 503 });
  }
  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) return Response.json({ error: 'file field required' }, { status: 400 });

  const mode = form.get('mode');
  if (typeof mode !== 'string' || !(MODES as readonly string[]).includes(mode)) {
    return Response.json({ error: 'mode must be one of INTRODUCTION, DEEP_RELAXATION, RETURN' }, { status: 400 });
  }

  // MPEG audio (.mp3/.mpeg, audio/mpeg) → OpenAI's "mp3" format; WAV → "wav".
  const name = file.name.toLowerCase();
  const format = file.type === 'audio/mpeg' || name.endsWith('.mp3') || name.endsWith('.mpeg') ? 'mp3'
    : file.type === 'audio/wav' || file.type === 'audio/x-wav' || name.endsWith('.wav') ? 'wav'
    : null;
  if (!format) return Response.json({ error: 'MP3, MPEG, or WAV only' }, { status: 400 });
  if (file.size > config.analysis.maxUploadBytes) {
    const mb = Math.round(config.analysis.maxUploadBytes / 1048576);
    return Response.json(
      { error: `File exceeds ${mb} MB — re-encode around 128 kbps mono and retry` },
      { status: 400 },
    );
  }

  const data = Buffer.from(await file.arrayBuffer()).toString('base64');
  const res = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.analysis.model,
      messages: [
        { role: 'system', content: buildSystemPrompt() }, // blind: vocabulary + format only
        {
          role: 'user',
          content: [
            { type: 'input_audio', input_audio: { data, format } },
            { type: 'text', text: 'Analyze this track and return JSON exactly per the schema.' },
          ],
        },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'track_analysis', strict: true, schema: OPENAI_ANALYSIS_JSON_SCHEMA },
      },
    }),
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 300);
    return Response.json({ error: `OpenAI ${res.status}: ${detail}` }, { status: 502 });
  }

  const payload = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  let result;
  try {
    result = AnalysisResultSchema.parse(JSON.parse(payload.choices?.[0]?.message?.content ?? ''));
  } catch {
    return Response.json({ error: 'model returned a malformed analysis' }, { status: 502 });
  }
  return Response.json({
    mode,
    description: result.description,
    sections: result.sections,
    candidates: classifyObservations(result, mode as (typeof MODES)[number]),
  });
}
