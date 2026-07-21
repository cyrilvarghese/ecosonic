import { config } from '@/config';
import { AnalysisResultSchema, extractJsonObject } from '@/rules/analysisSchema';
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
            {
              type: 'text',
              // Audio models support neither json_schema nor json_object response_format,
              // so we ask for raw JSON in the prompt and validate the reply with zod below.
              text: 'Analyze this track and reply with ONLY the JSON object required by the schema — no prose, no markdown, no code fences.',
            },
          ],
        },
      ],
    }),
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 300);
    return Response.json({ error: `OpenAI ${res.status}: ${detail}` }, { status: 502 });
  }

  const payload = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const raw = payload.choices?.[0]?.message?.content ?? '';
  let result;
  try {
    result = AnalysisResultSchema.parse(JSON.parse(extractJsonObject(raw)));
  } catch (err) {
    console.error('[analyze] malformed analysis — raw model reply:\n', raw);
    console.error('[analyze] parse/validation error:\n', err);
    return Response.json({ error: 'model returned a malformed analysis' }, { status: 502 });
  }
  return Response.json({
    description: result.description,
    sections: result.sections,
    candidates: classifyObservations(result),
  });
}
