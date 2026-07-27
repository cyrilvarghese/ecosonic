import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { loadSessions, elementFromFilename } from '@/remix/loadSessions';
import { parseSessionTimeline } from '@/remix/parseSessionTimeline';

export const runtime = 'nodejs';

const dir = (): string =>
  process.env.ECOSONIC_SESSIONS_DIR ?? path.join(process.cwd(), 'config', 'sessions');

const Upload = z.object({
  filename: z.string().regex(/^[a-z0-9-]+\.md$/i),
  markdown: z.string().min(1),
});

export async function GET() {
  return Response.json(loadSessions(dir()));
}

export async function POST(req: Request) {
  const parsed = Upload.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'bad request' }, { status: 400 });
  const element = elementFromFilename(parsed.data.filename);
  if (!element) return Response.json({ error: 'filename needs an element prefix' }, { status: 400 });
  const { rules, warnings } = parseSessionTimeline(parsed.data.markdown, element);
  if (rules.length === 0) return Response.json({ error: 'no parsable rules', warnings }, { status: 422 });
  writeFileSync(path.join(dir(), parsed.data.filename), parsed.data.markdown);
  const doc = { id: parsed.data.filename.replace(/\.md$/, ''), element, label: parsed.data.filename, rules };
  return Response.json({ doc, warnings }, { status: 201 });
}
