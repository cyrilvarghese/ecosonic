import type { ReactNode } from 'react';
import type { Block } from '@/rules/parseRulebook';

/** `**bold**` before `*italic*`, so the two-asterisk form wins. Deliberately a small subset — the
 *  doc is prose with emphasis, code spans, links and tables, and nothing else. */
const INLINE = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g;

/** Render one line of markdown-ish text. Unknown syntax simply survives as plain text, which is the
 *  right failure: the doc stays readable even where this does not understand it. */
export function inline(text: string): ReactNode[] {
  return text.split(INLINE).filter(Boolean).map((tok, i) => {
    if (tok.startsWith('`') && tok.endsWith('`')) {
      return (
        <code key={i} className="rounded bg-muted/70 px-1 py-0.5 font-mono text-[0.85em]">
          {tok.slice(1, -1)}
        </code>
      );
    }
    if (tok.startsWith('**') && tok.endsWith('**')) {
      return <strong key={i} className="font-medium text-foreground">{tok.slice(2, -2)}</strong>;
    }
    if (tok.startsWith('*') && tok.endsWith('*')) return <em key={i}>{tok.slice(1, -1)}</em>;
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(tok);
    if (link) {
      return (
        <a
          key={i}
          href={link[2]}
          className="underline decoration-dotted underline-offset-2 hover:text-[var(--accent-ink)]"
        >
          {link[1]}
        </a>
      );
    }
    return <span key={i}>{tok}</span>;
  });
}

/** The body of a rule: paragraphs, bullet lists and tables, in the order the doc had them. */
export function RuleBlocks({ blocks }: { blocks: Block[] }) {
  return (
    <div className="flex flex-col gap-3">
      {blocks.map((b, i) => {
        if (b.kind === 'p') {
          return <p key={i} className="text-sm leading-relaxed text-muted-foreground">{inline(b.text)}</p>;
        }
        if (b.kind === 'ul') {
          return (
            <ul key={i} className="flex list-disc flex-col gap-1.5 pl-5 text-sm leading-relaxed text-muted-foreground">
              {b.items.map((it, j) => <li key={j}>{inline(it)}</li>)}
            </ul>
          );
        }
        return (
          <div key={i} className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr>
                  {b.head.map((h, j) => (
                    <th
                      key={j}
                      className="border-b border-border px-2 py-1.5 text-left font-medium text-foreground"
                    >
                      {inline(h)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {b.rows.map((row, j) => (
                  <tr key={j} className="align-top">
                    {row.map((cell, k) => (
                      <td key={k} className="border-b border-border/50 px-2 py-1.5 text-muted-foreground">
                        {inline(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
