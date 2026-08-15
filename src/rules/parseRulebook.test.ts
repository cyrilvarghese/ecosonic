import { describe, it, expect } from 'vitest';
import { parseRulebook } from './parseRulebook';

const doc = (...lines: string[]) => lines.join('\n');

describe('parseRulebook', () => {
  it('takes the page title and the prose before the first section', () => {
    const book = parseRulebook(doc(
      '# Remix — the rules',
      '',
      'How /remix turns timelines into a mix.',
      '',
      '## 1. The three things',
      '',
      '**1.1** A thing.',
    ));
    expect(book.title).toBe('Remix — the rules');
    expect(book.intro).toEqual([{ kind: 'p', text: 'How /remix turns timelines into a mix.' }]);
  });

  it('numbers a section from its heading, letter suffixes included', () => {
    const book = parseRulebook(doc('## 5a. Effect sends', '', '**5a.1** Two sends per lane.'));
    expect(book.sections[0].id).toBe('5a');
    expect(book.sections[0].title).toBe('Effect sends');
  });

  it('splits a titled rule into id, title and body', () => {
    const book = parseRulebook(doc(
      '## 3. Choosing',
      '',
      '**3.6 — No sample, no lead.** A rule can only sound through an element',
      'that ships a sample.',
    ));
    const [rule] = book.sections[0].entries;
    expect(rule.id).toBe('3.6');
    expect(rule.title).toBe('No sample, no lead.');
    expect(rule.body).toEqual([
      { kind: 'p', text: 'A rule can only sound through an element that ships a sample.' },
    ]);
  });

  it('leaves the title null when a rule has none', () => {
    const book = parseRulebook(doc('## 2. Pool', '', '**2.1** Every session file is parsed.'));
    const [rule] = book.sections[0].entries;
    expect(rule.id).toBe('2.1');
    expect(rule.title).toBeNull();
    expect(rule.body).toEqual([{ kind: 'p', text: 'Every session file is parsed.' }]);
  });

  it('keeps a title that ends in a colon rather than a full stop', () => {
    const book = parseRulebook(doc('## 4. Timeline', '', '**4.1 — Full session:** used as authored.'));
    expect(book.sections[0].entries[0].title).toBe('Full session:');
  });

  it('keeps every paragraph of a multi-paragraph rule', () => {
    const book = parseRulebook(doc(
      '## 5a. Sends',
      '',
      '**5a.1 — Two sends per lane**, reverb and delay.',
      '',
      'They are stored per lane but driven per category.',
      '',
      'These levels were tuned by ear.',
    ));
    const [rule] = book.sections[0].entries;
    expect(rule.body).toHaveLength(3);
    expect(rule.body[2]).toEqual({ kind: 'p', text: 'These levels were tuned by ear.' });
  });

  it('reads a table into a head and rows', () => {
    const book = parseRulebook(doc(
      '## 2. Pool',
      '',
      '**2.3** Window starts disagree:',
      '',
      '| element | Introduction |',
      '|---|---|',
      '| EARTH | 0:00–10:00 |',
      '| **AIR** | 0:00–**9:30** |',
    ));
    expect(book.sections[0].entries[0].body[1]).toEqual({
      kind: 'table',
      head: ['element', 'Introduction'],
      rows: [['EARTH', '0:00–10:00'], ['**AIR**', '0:00–**9:30**']],
    });
  });

  it('reads a bullet list', () => {
    const book = parseRulebook(doc(
      '## 3. Choosing',
      '',
      '**3.6** Borrowed decides it by hand:',
      '',
      '- **Sound: EARTH** — always plays.',
      '- **Sound: ETHER** — always skipped.',
    ));
    expect(book.sections[0].entries[0].body[1]).toEqual({
      kind: 'ul',
      items: ['**Sound: EARTH** — always plays.', '**Sound: ETHER** — always skipped.'],
    });
  });

  it('keeps a section’s opening prose separate from its rules', () => {
    const book = parseRulebook(doc(
      '## 6. Whole loops',
      '',
      'On by default. Every interval is resized.',
      '',
      '**6.1** loops = round(interval / sample).',
    ));
    const [section] = book.sections;
    expect(section.blurb).toEqual([{ kind: 'p', text: 'On by default. Every interval is resized.' }]);
    expect(section.entries).toHaveLength(1);
  });

  it('ends a rule at the next rule, and a section at the next heading', () => {
    const book = parseRulebook(doc(
      '## 3. Choosing',
      '',
      '**3.1** First.',
      '',
      '**3.2** Second.',
      '',
      '## 4. Timeline',
      '',
      '**4.1** Third.',
    ));
    expect(book.sections.map((s) => s.id)).toEqual(['3', '4']);
    expect(book.sections[0].entries.map((e) => e.id)).toEqual(['3.1', '3.2']);
    expect(book.sections[1].entries.map((e) => e.id)).toEqual(['4.1']);
  });

  it('ignores a horizontal rule, which separates the preamble', () => {
    const book = parseRulebook(doc('# T', '', 'Intro.', '', '---', '', '## 1. S', '', '**1.1** A.'));
    expect(book.intro).toEqual([{ kind: 'p', text: 'Intro.' }]);
  });

  it('parses the real rulebook, dropping nothing', () => {
    // Guards the parser against the doc drifting into a shape it cannot read.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const md: string = require('node:fs').readFileSync('docs/remix-rules.md', 'utf8');
    const book = parseRulebook(md);

    // Every numbered rule in the file reaches the parsed book — the strongest thing to assert,
    // because the failure that matters is a rule silently swallowed by a bad split.
    const inFile = [...md.matchAll(/^\*\*(\d+[a-z]?\.\d+[a-z]?)\s*(?:[—-]|\*\*)/gm)].map((m) => m[1]);
    const parsed = book.sections.flatMap((s) => s.entries.map((e) => e.id));
    expect(parsed).toEqual(inFile);
    expect(new Set(parsed).size).toBe(parsed.length);
    expect(parsed.length).toBeGreaterThanOrEqual(40);

    // §1, §7, §8 and §9 are narrative — prose and tables, no numbered rules. So a section must
    // carry SOMETHING, but not necessarily rules.
    expect(book.sections.length).toBeGreaterThanOrEqual(9);
    for (const s of book.sections) {
      expect(s.title.length).toBeGreaterThan(0);
      expect(s.entries.length + s.blurb.length).toBeGreaterThan(0);
      for (const e of s.entries) expect(e.body.length).toBeGreaterThan(0);
    }
  });
});
