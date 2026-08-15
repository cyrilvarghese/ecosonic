/** The rulebook, parsed out of `docs/remix-rules.md`.
 *
 *  The doc is the single source of truth: it is prose first, and this reads it rather than asking
 *  anyone to keep a second copy in sync. `scripts/build-rulebook.ts` bakes the result to
 *  `src/rulebook.json`, and a test re-parses the doc and compares, so an edited rule that was never
 *  rebuilt fails the suite instead of shipping a stale page.
 *
 *  Pure and string-in/JSON-out, like `parseSessionTimeline` — no filesystem, so it unit-tests. */

/** A run of body content. `text`/`items`/cells keep their inline markdown (`**bold**`, `` `code` ``,
 *  `[link](href)`) for the view to render; parsing inline is the renderer's job, not this one's. */
export type Block =
  | { kind: 'p'; text: string }
  | { kind: 'ul'; items: string[] }
  | { kind: 'table'; head: string[]; rows: string[][] };

export interface RuleEntry {
  /** `3.6`, `5a.1` — the number the doc and the codebase both cite. */
  id: string;
  /** The bold lead-in, where the rule has one. `2.1` and friends open straight into prose. */
  title: string | null;
  body: Block[];
}

export interface RuleSection {
  id: string;
  title: string;
  /** Prose between the heading and the first numbered rule. */
  blurb: Block[];
  entries: RuleEntry[];
}

export interface Rulebook {
  title: string;
  /** Prose before the first section heading. */
  intro: Block[];
  sections: RuleSection[];
}

// Positional capture groups, not named ones: the project's TS target predates ES2018, where named
// groups arrived. `[1]` is the id throughout, so the shape stays legible without them.
const SECTION = /^##\s+(\d+[a-z]?)\.\s+(.+?)\s*$/;
/** `**3.6 — Title.** rest`, or `**2.1** rest` with no title. Both dash characters are accepted.
 *  The title is matched lazily rather than as "anything but an asterisk": §3.4's title carries
 *  *italics*, and italics are single asterisks, so the lazy run still stops at the closing `**`. */
const ENTRY = /^\*\*(\d+[a-z]?\.\d+[a-z]?)(?:\s*[—-]\s*(.+?))?\*\*(.*)$/;

/** Group raw lines into paragraphs, lists and tables. Blank lines end whatever is open. */
function toBlocks(lines: string[]): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  let items: string[] = [];
  let table: string[][] = [];

  const flush = () => {
    if (para.length) blocks.push({ kind: 'p', text: para.join(' ').trim() });
    if (items.length) blocks.push({ kind: 'ul', items: [...items] });
    if (table.length) {
      // Row 2 of a markdown table is the `|---|---|` alignment rule, which carries no content.
      const [head, , ...rows] = table;
      blocks.push({ kind: 'table', head, rows });
    }
    para = []; items = []; table = [];
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) { flush(); continue; }

    if (line.trimStart().startsWith('|')) {
      if (para.length || items.length) flush();
      table.push(line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
      continue;
    }
    if (/^\s*[-*]\s+/.test(line) && !/^-{3,}$/.test(line.trim())) {
      if (para.length || table.length) flush();
      items.push(line.replace(/^\s*[-*]\s+/, '').trim());
      continue;
    }
    if (/^-{3,}$/.test(line.trim())) { flush(); continue; } // horizontal rule
    if (items.length || table.length) flush();
    para.push(line.trim());
  }
  flush();
  return blocks;
}

export function parseRulebook(markdown: string): Rulebook {
  const lines = markdown.split(/\r?\n/);

  let title = '';
  const introLines: string[] = [];
  const sections: RuleSection[] = [];

  let section: RuleSection | null = null;
  let entry: { id: string; title: string | null; lines: string[] } | null = null;
  let sectionBlurb: string[] = [];

  const closeEntry = () => {
    if (section && entry) {
      section.entries.push({ id: entry.id, title: entry.title, body: toBlocks(entry.lines) });
    }
    entry = null;
  };
  const closeSection = () => {
    closeEntry();
    if (section) {
      section.blurb = toBlocks(sectionBlurb);
      sections.push(section);
    }
    sectionBlurb = [];
  };

  for (const line of lines) {
    if (!title && line.startsWith('# ')) { title = line.slice(2).trim(); continue; }

    const head = SECTION.exec(line);
    if (head) {
      closeSection();
      section = { id: head[1], title: head[2], blurb: [], entries: [] };
      continue;
    }

    // A `###` sub-heading inside a section is prose to whatever is open, not a new rule.
    const rule = ENTRY.exec(line);
    if (rule && section) {
      closeEntry();
      entry = { id: rule[1], title: rule[2]?.trim() || null, lines: [rule[3].trim()] };
      continue;
    }

    if (entry) entry.lines.push(line);
    else if (section) sectionBlurb.push(line);
    else introLines.push(line);
  }
  closeSection();

  return { title, intro: toBlocks(introLines), sections };
}
