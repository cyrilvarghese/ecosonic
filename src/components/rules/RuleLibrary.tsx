'use client';
import { INVARIANTS, PRINCIPLES, grammarRows } from '@/rules/inventory';
import type { DiscoveredRule } from '@/rules/analysisSchema';

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="rounded-[var(--radius-md)] border border-border bg-card p-3">
      <summary className="cursor-pointer text-sm font-medium">{title}</summary>
      <div className="mt-2">{children}</div>
    </details>
  );
}

export function RuleLibrary({
  discovered, onPromote, onDiscard,
}: {
  discovered: DiscoveredRule[];
  onPromote: (id: string) => void;
  onDiscard: (id: string) => void;
}) {
  const rows = grammarRows();
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-medium">Rule library</h2>
      <Group title="Principles (R1–R9)">
        <ul className="flex flex-col gap-1 text-sm">
          {PRINCIPLES.map((r) => (
            <li key={r.id}>
              <span className="label mr-2">{r.id}</span>{r.title} —{' '}
              <span className="text-muted-foreground">{r.text}</span>
            </li>
          ))}
        </ul>
      </Group>
      <Group title="Invariants (I1–I6, enforced in code)">
        <ul className="flex flex-col gap-1 text-sm">
          {INVARIANTS.map((r) => (
            <li key={r.id}>
              <span className="label mr-2">{r.id}</span>{r.title} —{' '}
              <span className="text-muted-foreground">{r.text}</span>
            </li>
          ))}
        </ul>
      </Group>
      <Group title="Live grammar (what Generate draws from)">
        <div className="overflow-x-auto">
          <table className="w-full text-xs tabular-nums">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="pr-3">mode</th><th className="pr-3">layer</th><th className="pr-3">enter</th>
                <th className="pr-3">exit</th><th className="pr-3">fadeIn</th><th className="pr-3">fadeOut</th>
                <th className="pr-3">present</th><th>after</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-border">
                  <td className="pr-3">{r.mode}</td><td className="pr-3">{r.category}</td>
                  <td className="pr-3">{r.enter}</td><td className="pr-3">{r.exit}</td>
                  <td className="pr-3">{r.fadeIn}</td><td className="pr-3">{r.fadeOut}</td>
                  <td className="pr-3">{r.present}</td><td>{r.after}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Group>
      <Group title={`Discovered (${discovered.length})`}>
        {discovered.length === 0 && (
          <p className="text-xs text-muted-foreground">Nothing kept yet — analyze a track below.</p>
        )}
        <ul className="flex flex-col gap-2">
          {discovered.map((r) => (
            <li key={r.id} className="rounded border border-border p-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="label">{r.status}</span>
                <span>{r.text}</span>
                <span className="ml-auto text-[11px] text-muted-foreground">
                  {r.source.file} · {r.source.date.slice(0, 10)}
                </span>
              </div>
              <div className="mt-1 flex gap-2">
                {r.status === 'kept' && r.structured && r.mode && (
                  <button type="button" onClick={() => onPromote(r.id)}
                    className="rounded-full border border-[var(--accent)] px-2.5 py-0.5 text-[11px] text-[var(--accent-ink)]">
                    Promote
                  </button>
                )}
                {r.status === 'kept' && (
                  <button type="button" onClick={() => onDiscard(r.id)}
                    className="rounded-full border border-border px-2.5 py-0.5 text-[11px] text-muted-foreground">
                    Discard
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </Group>
    </section>
  );
}
