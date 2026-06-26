import { createReadStream, promises as fs } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import type { NextRequest } from 'next/server';

export const runtime = 'nodejs';

const ROOT = path.join(process.cwd(), 'ECOSONIC FILES');

const MIME: Record<string, string> = {
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
};

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  const { path: segments } = await ctx.params;
  const rel = segments.map(decodeURIComponent).join(path.sep);
  const filePath = path.join(ROOT, rel);

  // Prevent path traversal outside ROOT.
  if (!filePath.startsWith(ROOT)) {
    return new Response('Forbidden', { status: 403 });
  }

  let size: number;
  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) return new Response('Not found', { status: 404 });
    size = stat.size;
  } catch {
    return new Response('Not found', { status: 404 });
  }

  const type = MIME[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
  const range = req.headers.get('range');

  if (range) {
    const match = /bytes=(\d*)-(\d*)/.exec(range);
    const start = match && match[1] ? parseInt(match[1], 10) : 0;
    const end = match && match[2] ? parseInt(match[2], 10) : size - 1;
    if (start >= size || end >= size || start > end) {
      return new Response('Range Not Satisfiable', {
        status: 416,
        headers: { 'Content-Range': `bytes */${size}` },
      });
    }
    const nodeStream = createReadStream(filePath, { start, end });
    return new Response(Readable.toWeb(nodeStream) as ReadableStream, {
      status: 206,
      headers: {
        'Content-Type': type,
        'Content-Length': String(end - start + 1),
        'Content-Range': `bytes ${start}-${end}/${size}`,
        'Accept-Ranges': 'bytes',
      },
    });
  }

  const nodeStream = createReadStream(filePath);
  return new Response(Readable.toWeb(nodeStream) as ReadableStream, {
    status: 200,
    headers: {
      'Content-Type': type,
      'Content-Length': String(size),
      'Accept-Ranges': 'bytes',
    },
  });
}
