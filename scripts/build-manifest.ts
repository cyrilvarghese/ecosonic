import { promises as fs } from 'node:fs';
import path from 'node:path';
import { buildManifest, type RawFile } from '../src/session/manifestBuild';

const ROOT = path.join(process.cwd(), 'ECOSONIC FILES');
const OUT = path.join(process.cwd(), 'src', 'manifest.json');

async function walk(dir: string, rel = ''): Promise<RawFile[]> {
  const out: RawFile[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const abs = path.join(dir, e.name);
    const relPath = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) {
      out.push(...(await walk(abs, relPath)));
    } else if (e.isFile()) {
      const { size } = await fs.stat(abs);
      out.push({ path: relPath, bytes: size });
    }
  }
  return out;
}

async function main() {
  const files = await walk(ROOT);
  const manifest = buildManifest(files);
  await fs.writeFile(OUT, JSON.stringify(manifest, null, 2));
  const total = Object.values(manifest)
    .flatMap((el) => Object.values(el))
    .reduce((n, arr) => n + arr.length, 0);
  console.log(`Wrote ${OUT} with ${total} samples across ${Object.keys(manifest).length} elements.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
