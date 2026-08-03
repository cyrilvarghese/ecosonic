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

/** The name an uploaded session is stored under, so `elementFromFilename` finds it again on the
 *  next load: the chosen element, then a slug of the original name. An existing element prefix is
 *  replaced rather than stacked, so re-assigning an element does not give `water-fire-…`.
 *
 *  Everything outside `[a-z0-9]` becomes a hyphen, which also makes the result path-safe — a name
 *  like `../../etc/passwd.md` cannot escape the sessions directory. */
export function sessionFilename(
  originalName: string,
  element: ElementName,
  /** Names already in the sessions directory. An element may hold several sessions, so a clash
   *  gets a suffix rather than silently replacing what is already there. */
  taken: readonly string[] = [],
): string {
  const prefix = element.toLowerCase();
  const slug = originalName
    .replace(/\.md$/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const elementPrefix = new RegExp(`^(${ELEMENTS.join('|').toLowerCase()})-`);
  const stem = (slug === prefix ? '' : slug.replace(elementPrefix, '')) || 'session';

  const claimed = new Set(taken);
  let name = `${prefix}-${stem}.md`;
  for (let n = 2; claimed.has(name); n++) name = `${prefix}-${stem}-${n}.md`;
  return name;
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
    const id = file.replace(/\.md$/, '');
    // The file's id, not the element — an element may hold several sessions and each rule has to
    // name the one it came from.
    const { rules, warnings: w } = parseSessionTimeline(md, element, id);
    warnings.push(...w);
    const doc: SessionDoc = { id, element, label: file, rules };
    store[element].push(doc);
  }
  return { store, warnings };
}
