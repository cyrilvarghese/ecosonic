import { readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { RegistrySchema, type CandidateRule, type DiscoveredRule } from '@/rules/analysisSchema';

const defaultPath = (): string =>
  process.env.ECOSONIC_RULES_PATH ?? path.join(process.cwd(), 'config', 'discovered-rules.json');

export function readRegistry(filePath: string = defaultPath()): DiscoveredRule[] {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (e) {
    throw new Error(`discovered-rules registry unreadable at ${filePath}: ${(e as Error).message}`);
  }
  const parsed = RegistrySchema.safeParse(raw);
  if (!parsed.success) throw new Error(`discovered-rules registry invalid at ${filePath}`);
  return parsed.data;
}

function write(all: DiscoveredRule[], filePath: string): void {
  writeFileSync(filePath, JSON.stringify(all, null, 2) + '\n');
}

export function keepRule(
  candidate: CandidateRule,
  source: { file: string; model: string },
  filePath: string = defaultPath(),
): DiscoveredRule {
  const entry: DiscoveredRule = {
    ...candidate,
    id: randomUUID(),
    source: { ...source, date: new Date().toISOString() },
    status: 'kept',
  };
  const all = readRegistry(filePath);
  all.push(entry);
  write(all, filePath);
  return entry;
}

export function removeRule(id: string, filePath: string = defaultPath()): boolean {
  const all = readRegistry(filePath);
  const next = all.filter((r) => r.id !== id);
  if (next.length === all.length) return false;
  write(next, filePath);
  return true;
}

export function setStatus(
  id: string, status: 'kept' | 'promoted', filePath: string = defaultPath(),
): boolean {
  const all = readRegistry(filePath);
  const entry = all.find((r) => r.id === id);
  if (!entry) return false;
  entry.status = status;
  write(all, filePath);
  return true;
}
