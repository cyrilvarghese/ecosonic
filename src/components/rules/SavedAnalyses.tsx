'use client';
import { useState } from 'react';

export interface SavedMeta {
  fileName: string;
  savedAt: string;
  model: string;
  windowCount: number;
  candidateCount: number;
}

export function SavedAnalyses({
  items, onLoad, onDelete,
}: {
  items: SavedMeta[];
  onLoad: (fileName: string) => void;
  onDelete: (fileName: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className="rounded-[var(--radius-md)] border border-border bg-card">
      <button type="button" onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium">
        <span>Saved analyses ({items.length})</span>
        <span className="text-muted-foreground">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="flex flex-col gap-1 border-t border-border p-2">
          {items.length === 0 && (
            <p className="px-2 py-1 text-xs text-muted-foreground">No saved analyses yet.</p>
          )}
          {items.map((a) => (
            <div key={a.fileName} className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-muted">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">{a.fileName}</div>
                <div className="text-[11px] text-muted-foreground">
                  {new Date(a.savedAt).toLocaleString()} · {a.windowCount} pass · {a.candidateCount} candidates
                </div>
              </div>
              <button type="button" onClick={() => onLoad(a.fileName)}
                className="rounded-full px-3 py-1 text-xs text-white transition-calm" style={{ background: 'var(--accent-ink)' }}>
                Load
              </button>
              <button type="button" onClick={() => onDelete(a.fileName)}
                className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition-calm hover:text-foreground">
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
