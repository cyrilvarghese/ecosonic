import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Layer } from './Layer';
import type { EffectBuses } from './effects';

/** The link no test has ever covered: a dB value arriving at Layer, and the gain node it should
 *  move. jsdom implements no Web Audio, so this stands in a fake one and records what the
 *  AudioParam was actually asked to ramp to. */
function fakeParam() {
  return {
    value: 0,
    lastTarget: null as number | null,
    cancelScheduledValues() {},
    setValueAtTime(v: number) { this.value = v; },
    linearRampToValueAtTime(v: number) { this.lastTarget = v; this.value = v; },
  };
}

const fakeGain = () => ({ gain: fakeParam(), connect() {}, disconnect() {} });

function fakeCtx() {
  return {
    currentTime: 0,
    sampleRate: 44100,
    createGain: fakeGain,
    createAnalyser: () => ({ fftSize: 0, connect() {}, disconnect() {} }),
    createBufferSource: () => ({
      buffer: null as unknown, loop: false,
      connect() {}, disconnect() {}, start() {}, stop() {},
    }),
    decodeAudioData: async () => ({ duration: 10 }),
  };
}

const BUSES = { reverbBus: fakeGain(), delayBus: fakeGain(), tailSec: 1 } as unknown as EffectBuses;
const MIN_DB = -60;

async function loadedLayer(volumeDb: number) {
  const ctx = fakeCtx();
  const master = fakeGain();
  const layer = new Layer(
    ctx as unknown as AudioContext,
    master as unknown as GainNode,
    {
      id: 'MELODY·WATER', path: 'w.wav', bytes: 1, thresholdBytes: 1_000_000,
      volumeDb, minDb: MIN_DB, reverbSend: 0, delaySend: 0,
    },
    BUSES,
  );
  await layer.load();
  layer.trigger(); // started — the state a sounding track is in
  return layer;
}

/** The gain node Layer built for itself is the first one the context handed out. */
const gainOf = (layer: Layer) =>
  (layer as unknown as { gain: { gain: ReturnType<typeof fakeParam> } }).gain.gain;

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    arrayBuffer: async () => new ArrayBuffer(8),
    blob: async () => new Blob(['x']),
  })));
});

describe('Layer — a dB change reaches the gain node', () => {
  it('cuts: -30 dB ramps the gain down to ~0.032', async () => {
    const layer = await loadedLayer(0);
    expect(gainOf(layer).lastTarget).toBeCloseTo(1, 3); // unity to start

    layer.setVolumeDb(-30, 200);

    expect(gainOf(layer).lastTarget).toBeCloseTo(10 ** (-30 / 20), 4); // 0.0316
  });

  it('boosts: +20 dB ramps the gain up to 10', async () => {
    const layer = await loadedLayer(0);

    layer.setVolumeDb(20, 200);

    expect(gainOf(layer).lastTarget).toBeCloseTo(10, 3);
  });

  it('cuts and boosts are the same mechanism — neither is a special case', async () => {
    const layer = await loadedLayer(0);
    for (const db of [-30, -20, -10, 0, 10, 20]) {
      layer.setVolumeDb(db, 200);
      expect(gainOf(layer).lastTarget, `${db} dB`).toBeCloseTo(10 ** (db / 20), 4);
    }
  });

  it('keeps the level when the scheduler re-asserts the region envelope', async () => {
    // The scheduler writes the envelope every tick. If that ignored the level, a cut would be
    // undone within a frame — which is exactly what "the slider does nothing" would look like.
    const layer = await loadedLayer(0);
    layer.setVolumeDb(-30, 200);

    layer.setEnvelope(1, 200);

    expect(gainOf(layer).lastTarget).toBeCloseTo(10 ** (-30 / 20), 4);
  });

  it('scales the level by the envelope rather than replacing it', async () => {
    const layer = await loadedLayer(-6);
    layer.setEnvelope(0.5, 200);
    expect(gainOf(layer).lastTarget).toBeCloseTo(10 ** (-6 / 20) * 0.5, 4);
  });
});
