import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import baked from '@/rulebook.json';
import bakedIt from '@/rulebook.it.json';
import { parseRulebook, type Rulebook } from './parseRulebook';

/** The drift guard. `src/rulebook.json` is derived from `docs/remix-rules.md`; edit the doc without
 *  running `npm run build:rulebook` and the page would quietly show yesterday's rules. Given that a
 *  stale artefact is exactly how WATER's samples went missing for a fortnight, this fails loudly. */
describe('the baked rulebook', () => {
  it('matches the doc it is built from — run `npm run build:rulebook` if this fails', () => {
    const fresh = parseRulebook(readFileSync('docs/remix-rules.md', 'utf8'));
    expect(baked as unknown as Rulebook).toEqual(fresh);
  });

  it('carries every section and rule the page needs to render', () => {
    const book = baked as unknown as Rulebook;
    expect(book.title).toBeTruthy();
    expect(book.sections.length).toBeGreaterThanOrEqual(9);
    expect(book.sections.reduce((n, s) => n + s.entries.length, 0)).toBeGreaterThanOrEqual(40);
  });

  it('holds the rules added most recently, so the page is current', () => {
    const ids = (baked as unknown as Rulebook).sections.flatMap((s) => s.entries.map((e) => e.id));
    // PLANET fan-out and track locking — both authored today; their absence means a stale build.
    expect(ids).toContain('3.5a');
    expect(ids).toContain('3.9a');
  });
});

describe('the Italian rulebook', () => {
  const it_ = bakedIt as unknown as Rulebook;
  const en = baked as unknown as Rulebook;
  const ids = (b: Rulebook) => b.sections.flatMap((s) => s.entries.map((e) => e.id));

  it('matches its own doc — run `npm run build:rulebook` if this fails', () => {
    const fresh = parseRulebook(readFileSync('docs/remix-rules.it.md', 'utf8'));
    expect(it_).toEqual(fresh);
  });

  it('carries exactly the same sections and rules as the English', () => {
    // Structural parity is the drift this CAN catch: a rule added in English and never translated
    // fails here. Semantic staleness — English reworded, Italian left behind — it cannot see, which
    // is why the Italian doc says in its own header that English is authoritative.
    expect(it_.sections.map((s) => s.id)).toEqual(en.sections.map((s) => s.id));
    expect(ids(it_)).toEqual(ids(en));
  });

  it('is actually translated, not a copy of the English', () => {
    expect(it_.title).not.toBe(en.title);
    const enTitles = new Set(en.sections.map((s) => s.title));
    const shared = it_.sections.filter((s) => enTitles.has(s.title));
    expect(shared.length).toBeLessThanOrEqual(1); // at most an incidental match
  });

  it('keeps the rules that carry live panels, so the panels still find them', () => {
    for (const id of ['2.3', '3.5a', '3.6', '5a.7']) expect(ids(it_)).toContain(id);
  });
});
