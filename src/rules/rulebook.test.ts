import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import baked from '@/rulebook.json';
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
