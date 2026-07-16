import { z } from 'zod';
import { CandidateRuleSchema } from '@/rules/analysisSchema';
import { keepRule, readRegistry, removeRule, setStatus } from '@/rules/registry';
import { promoteRule } from '@/rules/promote';

export const runtime = 'nodejs';

const KeepBody = z.object({
  candidate: CandidateRuleSchema,
  source: z.object({ file: z.string().min(1), model: z.string().min(1) }),
});
const PatchBody = z.object({ id: z.string().min(1), action: z.enum(['promote', 'discard']) });

export async function GET() {
  return Response.json(readRegistry());
}

export async function POST(req: Request) {
  const parsed = KeepBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'bad request' }, { status: 400 });
  return Response.json(keepRule(parsed.data.candidate, parsed.data.source), { status: 201 });
}

export async function PATCH(req: Request) {
  const parsed = PatchBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'bad request' }, { status: 400 });
  const { id, action } = parsed.data;

  if (action === 'discard') {
    return removeRule(id)
      ? Response.json({ ok: true })
      : Response.json({ error: 'not found' }, { status: 404 });
  }

  const entry = readRegistry().find((r) => r.id === id);
  if (!entry) return Response.json({ error: 'not found' }, { status: 404 });
  if (!entry.structured || !entry.mode) {
    return Response.json(
      { error: 'rule has no structured form / section mapping — cannot promote' },
      { status: 422 },
    );
  }
  const res = promoteRule({ mode: entry.mode, category: entry.structured.category, patch: entry.structured.patch });
  if (!res.ok) return Response.json({ error: res.reason }, { status: 422 });
  setStatus(id, 'promoted');
  return Response.json({ ok: true });
}
