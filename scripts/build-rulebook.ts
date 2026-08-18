// Bake the rules docs into src/rulebook*.json, so /rulebook can render them with no filesystem and
// no markdown dependency at runtime — the same trick build-sessions.ts plays with the session
// timelines. The docs stay the single source of truth; these are derived artefacts.
//
//   npm run build:rulebook
//
// A test (src/rules/rulebook.test.ts) re-parses each doc and compares it to the baked file, so
// editing a rule and forgetting to run this fails the suite rather than shipping a stale page.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { parseRulebook } from '../src/rules/parseRulebook';

/** Each language is its own source doc with the SAME section and rule numbering, so one parser
 *  reads both and a test can assert they stay structurally identical. English is authoritative. */
const BOOKS = [
  { doc: 'remix-rules.md', out: 'rulebook.json' },
  { doc: 'remix-rules.it.md', out: 'rulebook.it.json' },
];

async function main() {
  for (const { doc, out } of BOOKS) {
    const book = parseRulebook(await fs.readFile(path.join(process.cwd(), 'docs', doc), 'utf8'));
    const target = path.join(process.cwd(), 'src', out);
    await fs.writeFile(target, `${JSON.stringify(book, null, 2)}\n`);
    const rules = book.sections.reduce((n, sec) => n + sec.entries.length, 0);
    console.log(`Wrote ${out} — ${book.sections.length} sections, ${rules} rules.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
