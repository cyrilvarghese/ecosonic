'use client';
import { useSession } from '@/session/appStore';
import { useAudioEngine } from '@/audio/useAudioEngine';
import { ElementChooser } from '@/components/ElementChooser';
import { TrackLane } from '@/components/TrackLane';
import { TransportBar } from '@/components/TransportBar';
import { Button } from '@/components/ui/button';

export function BuilderScreen() {
  const engine = useAudioEngine(); // create + keep the engine in sync with the store
  const element = useSession((s) => s.project.element);
  const trackIds = useSession((s) => s.project.tracks.map((t) => t.id));
  const backToChooser = useSession((s) => s.backToChooser);

  if (!element) return <ElementChooser />;

  return (
    <div data-element={element.toLowerCase()} className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <div>
          <p className="label">Layer One — Sound Ecosystem Builder</p>
          <h1 className="text-lg text-glow" style={{ color: 'var(--accent)' }}>{element}</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={backToChooser}>Change element</Button>
          <Button variant="outline" disabled>Continue to Layer Two</Button>
        </div>
      </header>

      <main className="flex flex-1 flex-col gap-2 overflow-y-auto p-6">
        {trackIds.map((id) => <TrackLane key={id} trackId={id} />)}
      </main>

      <TransportBar getAnalyser={() => engine.getAnalyser()} />
    </div>
  );
}
