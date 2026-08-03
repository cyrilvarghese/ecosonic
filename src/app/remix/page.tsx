'use client';
import Link from 'next/link';
import { RemixView } from '@/components/remix/RemixView';

export default function RemixPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <div>
          <p className="label">Remix</p>
          <h1 className="text-lg font-medium">Free-mix a session from authored rules</h1>
        </div>
        <Link href="/layer2" className="text-sm text-muted-foreground hover:text-foreground">
          ← Module Designer
        </Link>
      </header>
      <main className="mx-auto w-full max-w-[1680px] p-6">
        <RemixView />
      </main>
    </div>
  );
}
