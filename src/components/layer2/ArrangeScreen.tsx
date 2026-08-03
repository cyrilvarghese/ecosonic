'use client';
import { useRef, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { serializeArrangement, parseArrangement } from '@/arrange/arrangementFile';
import { renderModuleToWav } from '@/arrange/render/renderModuleWav';
import { renderSessionToWav } from '@/arrange/render/renderSessionWav';
import { buildSessionModules } from '@/arrange/session';
import { ArrowLeft, Play, Pause, ChevronDown, Check } from 'lucide-react';
import { Menu } from '@base-ui/react/menu';
import { useArrangement } from '@/arrange/arrangementStore';
import { useLayer2Engine } from '@/arrange/useLayer2Engine';
import { useModuleScheduler } from '@/arrange/useModuleScheduler';
import { DRIFTS } from '@/arrange/types';
import { ModuleDesigner } from '@/components/layer2/ModuleDesigner';
import { Button, buttonVariants } from '@/components/ui/button';
import { config } from '@/config';

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export function ArrangeScreen() {
  const router = useRouter();
  const engine = useLayer2Engine();
  useModuleScheduler(engine);

  const element = useArrangement((s) => s.element);
  const tracks = useArrangement((s) => s.tracks);
  const moduleRegions = useArrangement((s) => s.moduleRegions);
  const trackDurations = useArrangement((s) => s.trackDurations);
  const trackSends = useArrangement((s) => s.trackSends);
  const playing = useArrangement((s) => s.playing);
  const positionSec = useArrangement((s) => s.positionSec);
  const play = useArrangement((s) => s.play);
  const pause = useArrangement((s) => s.pause);
  const seek = useArrangement((s) => s.seek);
  const setScrubbing = useArrangement((s) => s.setScrubbing);
  const activeMode = useArrangement((s) => s.activeMode);
  const loadMode = useArrangement((s) => s.loadMode);
  const drift = useArrangement((s) => s.drift);
  const setDrift = useArrangement((s) => s.setDrift);
  const generateModule = useArrangement((s) => s.generateModule);
  const live = useArrangement((s) => s.live);
  const setLive = useArrangement((s) => s.setLive);
  const session = useArrangement((s) => s.session);
  const playSession = useArrangement((s) => s.playSession);
  const endSession = useArrangement((s) => s.endSession);
  const importArrangement = useArrangement((s) => s.importArrangement);
  const masterDb = useArrangement((s) => s.masterDb);
  const fileInput = useRef<HTMLInputElement>(null);
  const [showVolume, setShowVolume] = useState(true);
  const driftLabel = (d: (typeof DRIFTS)[number]) => d.charAt(0) + d.slice(1).toLowerCase();
  const [renderPct, setRenderPct] = useState<number | null>(null);

  const downloadBlob = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };
  const exportJson = () => {
    const text = serializeArrangement({ mode: activeMode, drift, regions: moduleRegions, tracks });
    downloadBlob(new Blob([text], { type: 'application/json' }), `ecosonic-${activeMode.toLowerCase()}.json`);
  };
  const importJson = async (f: File) => {
    try {
      importArrangement(parseArrangement(await f.text()));
    } catch {
      window.alert('Not a valid ECOSONIC arrangement file.');
    }
  };
  const exportWav = async () => {
    if (renderPct !== null) return;
    setRenderPct(0);
    try {
      const blob = await renderModuleToWav({
        tracks,
        regions: moduleRegions,
        masterDb,
        sends: trackSends,
        onProgress: (f) => setRenderPct(f),
      });
      downloadBlob(blob, `ecosonic-${activeMode.toLowerCase()}.wav`);
    } catch {
      window.alert('WAV render failed — check the console for details.');
    } finally {
      setRenderPct(null);
    }
  };
  const exportSession = async () => {
    if (renderPct !== null) return;
    setRenderPct(0);
    try {
      const { order, regionsByMode } = buildSessionModules(tracks, activeMode, moduleRegions, config);
      const blob = await renderSessionToWav({
        tracks,
        regionsByMode,
        order,
        masterDb,
        sends: trackSends,
        onProgress: (f) => setRenderPct(f),
      });
      downloadBlob(blob, el ? `session_${el}.wav` : 'session.wav');
    } catch {
      window.alert('Session WAV render failed — check the console for details.');
    } finally {
      setRenderPct(null);
    }
  };

  const D = config.layerTwo.moduleSeconds;
  const el = element ? element.toLowerCase() : undefined;
  // Inherit the chosen element's accent theme, same tokens as Layer One's builder.
  const themeStyle = el
    ? ({
        '--accent': `var(--c-${el})`,
        '--accent-ink': `var(--ink-${el})`,
        '--ring': `var(--c-${el})`,
        background:
          'radial-gradient(125% 70% at 50% 0%, color-mix(in oklch, var(--accent) 14%, var(--background)), var(--background) 60%)',
      } as CSSProperties)
    : undefined;

  return (
    <div data-element={el} className="flex min-h-screen flex-col bg-background" style={themeStyle}>
      <header className="flex items-center justify-between gap-4 border-b border-border px-6 py-2.5">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" aria-label="Return to Layer One" onClick={() => router.push('/layer1')}>
            <ArrowLeft size={18} />
          </Button>
          <p className="label">Layer Two — Module Designer</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setLive(!live)}
            aria-pressed={live}
            title="Live: steer drift and upcoming entrances while playing; off = the arrangement is frozen"
            className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs transition-calm ${
              live ? 'text-white' : 'bg-card text-muted-foreground hover:text-foreground'
            }`}
            style={live ? { background: 'var(--accent-ink)' } : undefined}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${live ? 'animate-pulse bg-white' : 'bg-muted-foreground'}`} aria-hidden />
            Live
          </button>
          <button
            type="button"
            aria-label={playing ? 'Pause' : 'Play'}
            onClick={() => (playing ? pause() : play())}
            className="flex h-9 w-9 items-center justify-center rounded-full text-white shadow-sm transition-calm hover:scale-105"
            style={{ background: 'var(--accent-ink)' }}
          >
            {playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" className="translate-x-[1px]" />}
          </button>
          <button
            type="button"
            onClick={() => (session ? endSession() : playSession())}
            aria-pressed={!!session}
            title="Play the full session: Introduction → Deep Relaxation → Return, then stop"
            className={`rounded-full px-3.5 py-1.5 text-xs transition-calm ${
              session ? 'text-white' : 'bg-card text-muted-foreground hover:text-foreground'
            }`}
            style={session ? { background: 'var(--accent-ink)' } : undefined}
          >
            {session ? `Session ${session.index + 1}/${session.order.length}` : 'Play Session'}
          </button>
          <input
            type="range"
            min={0}
            max={D}
            step={1}
            value={positionSec}
            onChange={(e) => seek(Number(e.target.value))}
            onPointerDown={() => setScrubbing(true)}
            onPointerUp={() => setScrubbing(false)}
            onPointerCancel={() => setScrubbing(false)}
            aria-label="Scrub playback position"
            disabled={live && playing}
            title={live && playing ? 'Scrubbing is off while Live — the past is committed' : undefined}
            className="w-44 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
            style={{ accentColor: 'var(--accent-ink)' }}
          />
          <span className="w-20 text-right text-xs tabular-nums text-muted-foreground">
            {clock(positionSec)} / {clock(D)}
          </span>
          <span className="mx-1 h-5 w-px bg-border" aria-hidden />
          {/* Split button: Generate (current variation) + a dropdown to pick/roll a variation. */}
          <div className="inline-flex overflow-hidden rounded-full shadow-sm" style={{ background: 'var(--accent-ink)' }}>
            <button
              type="button"
              onClick={() => generateModule()}
              className="px-4 py-1.5 text-sm font-medium text-white transition-calm hover:brightness-110"
            >
              Generate
            </button>
            <Menu.Root>
              <Menu.Trigger
                aria-label="Choose variation"
                className="flex items-center border-l border-white/25 px-1.5 text-white transition-calm hover:brightness-110"
              >
                <ChevronDown size={16} />
              </Menu.Trigger>
              <Menu.Portal>
                <Menu.Positioner side="bottom" align="end" sideOffset={6} className="z-50">
                  <Menu.Popup className="min-w-44 rounded-[var(--radius-md)] border border-border bg-popover p-1 text-popover-foreground shadow-lg outline-none">
                    <div className="px-2 pb-1 pt-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">Variation</div>
                    {DRIFTS.map((d) => (
                      <Menu.Item
                        key={d}
                        onClick={() => { setDrift(d); generateModule(); }}
                        className="flex cursor-pointer items-center justify-between gap-6 rounded px-2 py-1.5 text-sm outline-none select-none data-[highlighted]:bg-muted"
                      >
                        {driftLabel(d)}
                        {drift === d && <Check size={14} className="text-[var(--accent-ink)]" />}
                      </Menu.Item>
                    ))}
                  </Menu.Popup>
                </Menu.Positioner>
              </Menu.Portal>
            </Menu.Root>
          </div>
          <label className="flex cursor-pointer items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <input
              type="checkbox"
              checked={showVolume}
              onChange={(e) => setShowVolume(e.target.checked)}
              style={{ accentColor: 'var(--accent-ink)' }}
            />
            Volume
          </label>
          <a href="/rules" className={buttonVariants({ variant: 'link' })}>Rules →</a>
          <span className="mx-2 h-4 w-px bg-border" aria-hidden />
          <button
            type="button"
            onClick={exportJson}
            className="rounded-full border border-border px-3 py-1 text-xs transition-calm hover:text-foreground"
          >
            Export JSON
          </button>
          <button
            type="button"
            onClick={() => void exportWav()}
            disabled={renderPct !== null}
            className="rounded-full border border-border px-3 py-1 text-xs transition-calm hover:text-foreground disabled:cursor-wait disabled:opacity-60"
          >
            {renderPct === null ? 'Export WAV' : `Rendering ${Math.round(renderPct * 100)}%`}
          </button>
          <button
            type="button"
            onClick={() => void exportSession()}
            disabled={renderPct !== null}
            title="Render all three modules back-to-back into one WAV"
            className="rounded-full border border-border px-3 py-1 text-xs transition-calm hover:text-foreground disabled:cursor-wait disabled:opacity-60"
          >
            {renderPct === null ? 'Export Session' : `Rendering ${Math.round(renderPct * 100)}%`}
          </button>
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="rounded-full border border-border px-3 py-1 text-xs transition-calm hover:text-foreground"
          >
            Import
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importJson(f);
              e.target.value = '';
            }}
          />
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-6 py-4">
        {/* Line-variant mode tabs — each reseeds the module from that section's table. */}
        <div className="mb-4 flex items-center gap-6 border-b border-border">
          {config.layerTwo.modes.map((m) => {
            const active = activeMode === m;
            return (
              <button
                key={m}
                type="button"
                aria-pressed={active}
                onClick={() => loadMode(m)}
                className={`-mb-px border-b-2 px-1 pb-2 pt-0.5 text-base font-medium transition-calm ${
                  active
                    ? 'border-[var(--accent-ink)] text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {m.split('_').map((w) => w.charAt(0) + w.slice(1).toLowerCase()).join(' ')}
              </button>
            );
          })}
        </div>
        <ModuleDesigner tracks={tracks} regions={moduleRegions} trackDurations={trackDurations} positionSec={positionSec} showVolume={showVolume} live={live && playing} />
      </main>
    </div>
  );
}
