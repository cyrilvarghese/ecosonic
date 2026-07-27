import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { ElementName } from '@/types';
import { ELEMENTS } from '@/types';
import { parseSessionTimeline } from './parseSessionTimeline';
import type { RuleStore, SessionDoc } from './sessionRules';

/** "water-session-layer-timeline.md" → 'WATER'; null if the prefix isn't an element. */
export function elementFromFilename(name: string): ElementName | null {
  const prefix = name.split('-')[0]?.toUpperCase();
  return (ELEMENTS as string[]).includes(prefix ?? '') ? (prefix as ElementName) : null;
}

/** Read + parse every `*.md` in `dir` (default config/sessions/) into a RuleStore. One SessionDoc
 *  per file, element from the filename prefix. Aggregates all parser warnings. */
export function loadSessions(
  dir: string = path.join(process.cwd(), 'config', 'sessions'),
): { store: RuleStore; warnings: string[] } {
  const store: RuleStore = { EARTH: [], WATER: [], AIR: [], FIRE: [], ETHER: [] };
  const warnings: string[] = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.md'))) {
    const element = elementFromFilename(file);
    if (!element) {
      warnings.push(`${file}: filename has no element prefix — skipped`);
      continue;
    }
    const md = readFileSync(path.join(dir, file), 'utf8');
    const { rules, warnings: w } = parseSessionTimeline(md, element);
    warnings.push(...w);
    const doc: SessionDoc = { id: file.replace(/\.md$/, ''), element, label: file, rules };
    store[element].push(doc);
  }
  return { store, warnings };
}
