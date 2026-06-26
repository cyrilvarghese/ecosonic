'use client';
import type { CSSProperties } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useSession } from '@/session/appStore';
import { useAudioEngine } from '@/audio/useAudioEngine';
import { EngineProvider } from '@/audio/EngineContext';
import { ElementChooser } from '@/components/ElementChooser';
import { TrackLane } from '@/components/TrackLane';
import { TransportBar } from '@/components/TransportBar';
import { Button } from '@/components/ui/button';

export function BuilderScreen() {
  const engine = useAudioEngine(); // create + keep the engine in sync with the store
  const element = useSession((s) => s.project.element);
  const trackIds = useSession(useShallow((s) => s.project.tracks.map((t) => t.id)));
  const backToChooser = useSession((s) => s.backToChooser);

  if (!element) return <ElementChooser />;

  const el = element.toLowerCase();
  // Set the element theme inline on the wrapper so the whole subtree inherits the
  // right accent — independent of the [data-element] stylesheet rule / hot-reload.
  const themeStyle = {
    '--accent': `var(--c-${el})`,
    '--accent-ink': `var(--ink-${el})`,
    '--ring': `var(--c-${el})`,
    background:
      'radial-gradient(125% 70% at 50% 0%, color-mix(in oklch, var(--accent) 18%, var(--background)), var(--background) 55%)',
  } as CSSProperties;

  return (
    <EngineProvider value={engine}>
    <div data-element={el} className="flex min-h-screen flex-col" style={themeStyle}>
      <header
        className="flex items-center justify-between border-b px-6 py-4"
        style={{ borderColor: 'color-mix(in oklch, var(--accent) 40%, var(--border))' }}
      >
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" aria-label="Back to element selection" onClick={backToChooser}>
            <ArrowLeft size={18} />
          </Button>
          <div>
            <p className="label">Layer One — Sound Ecosystem Builder</p>
            <h1 className="text-lg font-medium" style={{ color: `var(--ink-${element.toLowerCase()})` }}>{element}</h1>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" disabled>Continue to Layer Two</Button>
        </div>
      </header>

      <main className="flex flex-1 flex-col gap-2 overflow-y-auto p-6">
        {trackIds.map((id) => <TrackLane key={id} trackId={id} />)}
      </main>

      <TransportBar getAnalyser={() => engine.getAnalyser()} />
    </div>
    </EngineProvider>
  );
}
