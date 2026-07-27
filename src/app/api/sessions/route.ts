import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { ELEMENTS, type ElementName } from '@/types';
import { loadSessions, elementFromFilename, sessionFilename } from '@/remix/loadSessions';
import { parseSessionTimeline } from '@/remix/parseSessionTimeline';

export const runtime = 'nodejs';

const dir = (): string =>
  process.env.ECOSONIC_SESSIONS_DIR ?? path.join(process.cwd(), 'config', 'sessions');

const Upload = z.object({
  // Any name: sessionFilename slugifies it and prefixes the element, which is also what makes the
  // stored path safe. The element prefix is how loadSessions finds it again.
  filename: z.string().min(1).max(200),
  markdown: z.string().min(1),
  element: z.enum(ELEMENTS as [string, ...string[]]).optional(),
});

export async function GET() {
  return Response.json(loadSessions(dir()));
}

export async function POST(req: Request) {
  const parsed = Upload.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'bad request' }, { status: 400 });
  // An explicitly chosen element wins; otherwise fall back to the filename prefix convention.
  const element = (parsed.data.element as ElementName | undefined)
    ?? elementFromFilename(parsed.data.filename);
  if (!element) {
    return Response.json({ error: 'choose an element for this session' }, { status: 400 });
  }
  const { rules, warnings } = parseSessionTimeline(parsed.data.markdown, element);
  if (rules.length === 0) return Response.json({ error: 'no parsable rules', warnings }, { status: 422 });

  const stored = sessionFilename(parsed.data.filename, element);
  writeFileSync(path.join(dir(), stored), parsed.data.markdown);
  const doc = { id: stored.replace(/\.md$/, ''), element, label: stored, rules };
  return Response.json({ doc, warnings }, { status: 201 });
}
