// Bake docs/remix-rules.md into src/rulebook.json, so /rulebook can render it with no filesystem
// and no markdown dependency at runtime — the same trick build-sessions.ts plays with the session
// timelines. The doc stays the single source of truth; this is a derived artefact.
//
//   npm run build:rulebook
//
// A test (src/rules/rulebook.test.ts) re-parses the doc and compares it to the baked file, so
// editing a rule and forgetting to run this fails the suite rather than shipping a stale page.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { parseRulebook } from '../src/rules/parseRulebook';

const DOC = path.join(process.cwd(), 'docs', 'remix-rules.md');
const OUT = path.join(process.cwd(), 'src', 'rulebook.json');

async function main() {
  const book = parseRulebook(await fs.readFile(DOC, 'utf8'));
  await fs.writeFile(OUT, `${JSON.stringify(book, null, 2)}\n`);
  const rules = book.sections.reduce((n, s) => n + s.entries.length, 0);
  console.log(`Wrote ${OUT} — ${book.sections.length} sections, ${rules} rules.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
