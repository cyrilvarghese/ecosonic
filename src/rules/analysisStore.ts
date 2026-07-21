import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { AnalysisStoreSchema, type SavedAnalysis } from '@/rules/analysisSchema';

const defaultPath = (): string =>
  process.env.ECOSONIC_ANALYSES_PATH ?? path.join(process.cwd(), 'config', 'analyses.json');

export function readAnalyses(filePath: string = defaultPath()): SavedAnalysis[] {
  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf8');
  } catch {
    return []; // no store yet → empty
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error(`analyses store unreadable at ${filePath}`);
  }
  const parsed = AnalysisStoreSchema.safeParse(json);
  if (!parsed.success) throw new Error(`analyses store invalid at ${filePath}`);
  return parsed.data;
}

function write(all: SavedAnalysis[], filePath: string): void {
  writeFileSync(filePath, JSON.stringify(all, null, 2) + '\n');
}

/** Upsert by fileName; latest wins. savedAt is stamped here, not sent by the client. */
export function saveAnalysis(
  input: Omit<SavedAnalysis, 'savedAt'>, filePath: string = defaultPath(),
): SavedAnalysis {
  const entry: SavedAnalysis = { ...input, savedAt: new Date().toISOString() };
  const all = readAnalyses(filePath).filter((a) => a.fileName !== entry.fileName);
  all.push(entry);
  write(all, filePath);
  return entry;
}

export function getAnalysis(fileName: string, filePath: string = defaultPath()): SavedAnalysis | null {
  return readAnalyses(filePath).find((a) => a.fileName === fileName) ?? null;
}

export function deleteAnalysis(fileName: string, filePath: string = defaultPath()): boolean {
  const all = readAnalyses(filePath);
  const next = all.filter((a) => a.fileName !== fileName);
  if (next.length === all.length) return false;
  write(next, filePath);
  return true;
}
