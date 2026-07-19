import { SavedAnalysisSchema } from '@/rules/analysisSchema';
import { readAnalyses, saveAnalysis, getAnalysis, deleteAnalysis } from '@/rules/analysisStore';

export const runtime = 'nodejs';

const SaveInput = SavedAnalysisSchema.omit({ savedAt: true });

export async function GET(req: Request) {
  const file = new URL(req.url).searchParams.get('file');
  if (file) {
    const entry = getAnalysis(file);
    return entry ? Response.json(entry) : Response.json({ error: 'not found' }, { status: 404 });
  }
  return Response.json(readAnalyses().map((a) => ({
    fileName: a.fileName,
    savedAt: a.savedAt,
    model: a.model,
    windowCount: a.windows.length,
    candidateCount: a.windows.reduce((n, w) => n + w.candidates.length, 0),
  })));
}

export async function POST(req: Request) {
  const parsed = SaveInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'bad request' }, { status: 400 });
  return Response.json(saveAnalysis(parsed.data), { status: 201 });
}

export async function DELETE(req: Request) {
  const file = new URL(req.url).searchParams.get('file');
  if (!file) return Response.json({ error: 'file query required' }, { status: 400 });
  return deleteAnalysis(file)
    ? Response.json({ ok: true })
    : Response.json({ error: 'not found' }, { status: 404 });
}
