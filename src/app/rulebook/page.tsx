'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import bakedRulebook from '@/rulebook.json';
import type { Block, Rulebook } from '@/rules/parseRulebook';
import { RuleBlocks, inline } from '@/components/rules/RuleBlocks';
import { LiveEvidence, RULES_WITH_EVIDENCE } from '@/components/rules/LiveEvidence';

const book = bakedRulebook as unknown as Rulebook;

/** Everything a rule says, flattened, so search matches body text and not only titles. */
const textOf = (blocks: Block[]): string =>
  blocks.map((b) => (b.kind === 'p' ? b.text
    : b.kind === 'ul' ? b.items.join(' ')
      : [...b.head, ...b.rows.flat()].join(' '))).join(' ');

export default function RulebookPage() {
  const [query, setQuery] = useState('');
  const [openIds, setOpenIds] = useState<ReadonlySet<string>>(new Set());

  const q = query.trim().toLowerCase();
  const sections = useMemo(() => {
    if (!q) return book.sections;
    return book.sections
      .map((s) => ({
        ...s,
        entries: s.entries.filter((e) =>
          e.id.toLowerCase().includes(q)
          || (e.title ?? '').toLowerCase().includes(q)
          || textOf(e.body).toLowerCase().includes(q)),
      }))
      .filter((s) => s.entries.length > 0 || s.title.toLowerCase().includes(q));
  }, [q]);

  const hits = sections.reduce((n, s) => n + s.entries.length, 0);
  const total = book.sections.reduce((n, s) => n + s.entries.length, 0);
  // Searching opens what it finds; otherwise a rule is a click away, so the page reads as an index.
  const isOpen = (id: string) => (q ? true : openIds.has(id));

  const toggle = (id: string) => setOpenIds((prev) => {
    const next = new Set(prev);
    if (!next.delete(id)) next.add(id);
    return next;
  });

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-3">
        <Link href="/remix" className="text-xs text-muted-foreground transition-calm hover:text-foreground">
          ← /remix
        </Link>
        <h1 className="text-2xl font-medium tracking-tight">{book.title}</h1>
        {book.intro.map((b, i) => (
          <div key={i} className="max-w-prose"><RuleBlocks blocks={[b]} /></div>
        ))}
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the rules…"
            aria-label="Search the rules"
            className="w-64 rounded-[var(--radius-md)] border border-border bg-transparent px-3 py-1.5 text-sm outline-none transition-calm focus:border-[var(--accent-ink)]"
          />
          <span className="text-xs tabular-nums text-muted-foreground">
            {q ? `${hits} of ${total} rules` : `${total} rules · ${book.sections.length} sections`}
          </span>
          {q && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="text-xs text-muted-foreground underline underline-offset-2 transition-calm hover:text-foreground"
            >
              clear
            </button>
          )}
        </div>
      </header>

      {hits === 0 && q && (
        <p className="text-sm text-muted-foreground">
          Nothing matches “{query}”. The rules cover the pool, the draw, the timeline, playback,
          sends, whole loops and the UI.
        </p>
      )}

      {sections.map((section) => (
        <section key={section.id} id={`s${section.id}`} className="flex flex-col gap-4">
          <h2 className="flex items-baseline gap-2 border-b border-border pb-1.5">
            <span className="font-mono text-sm text-[var(--accent-ink)]">§{section.id}</span>
            <span className="text-base font-medium">{section.title}</span>
          </h2>

          {section.blurb.length > 0 && (
            <div className="max-w-prose"><RuleBlocks blocks={section.blurb} /></div>
          )}

          <div className="flex flex-col">
            {section.entries.map((entry) => {
              const open = isOpen(entry.id);
              const evidence = RULES_WITH_EVIDENCE.includes(entry.id);
              return (
                <article key={entry.id} id={`r${entry.id}`} className="border-b border-border/60 last:border-0">
                  <button
                    type="button"
                    onClick={() => toggle(entry.id)}
                    aria-expanded={open}
                    className="group grid w-full grid-cols-[3.5rem_1fr] items-baseline gap-2 py-2.5 text-left transition-calm hover:bg-muted/40"
                  >
                    <span className="font-mono text-xs text-[var(--accent-ink)]">§{entry.id}</span>
                    <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
                      <span className="font-medium">
                        {entry.title ? inline(entry.title) : inline(firstWords(entry.body))}
                      </span>
                      {evidence && (
                        <span className="rounded bg-[var(--accent-ink)]/12 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[var(--accent-ink)]">
                          live
                        </span>
                      )}
                    </span>
                  </button>
                  {open && (
                    <div className="grid grid-cols-[3.5rem_1fr] gap-2 pb-5">
                      <span aria-hidden />
                      <div className="max-w-prose">
                        <RuleBlocks blocks={entry.body} />
                        <LiveEvidence ruleId={entry.id} />
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      ))}

      <footer className="border-t border-border pt-4 text-xs text-muted-foreground">
        Generated from <code className="font-mono">docs/remix-rules.md</code> by{' '}
        <code className="font-mono">npm run build:rulebook</code>. A test fails if the two drift
        apart, so what you are reading is what is built.
      </footer>
    </main>
  );
}

/** A rule with no bold lead-in still needs something to click: use its opening words. */
function firstWords(body: Block[]): string {
  const first = body.find((b) => b.kind === 'p');
  if (!first || first.kind !== 'p') return '';
  const words = first.text.split(/\s+/).slice(0, 9).join(' ');
  return first.text.split(/\s+/).length > 9 ? `${words}…` : words;
}
