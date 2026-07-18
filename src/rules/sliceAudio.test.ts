import { describe, it, expect } from 'vitest';
import { sliceWindows, encodeWav } from '@/rules/sliceAudio';

describe('sliceWindows', () => {
  it('full 30-min track → 3 windows aligned to the modes', () => {
    expect(sliceWindows(1800, 600)).toEqual([
      { mode: 'INTRODUCTION', startSec: 0, endSec: 600 },
      { mode: 'DEEP_RELAXATION', startSec: 600, endSec: 1200 },
      { mode: 'RETURN', startSec: 1200, endSec: 1800 },
    ]);
  });
  it('24-min track → 3 windows, last clamped to the track end', () => {
    expect(sliceWindows(1440, 600).at(-1)).toEqual({ mode: 'RETURN', startSec: 1200, endSec: 1440 });
  });
  it('12-min track → 2 windows (RETURN never starts)', () => {
    const w = sliceWindows(720, 600);
    expect(w.map((x) => x.mode)).toEqual(['INTRODUCTION', 'DEEP_RELAXATION']);
    expect(w[1]).toEqual({ mode: 'DEEP_RELAXATION', startSec: 600, endSec: 720 });
  });
  it('8-min track → 1 window', () => {
    expect(sliceWindows(480, 600)).toEqual([{ mode: 'INTRODUCTION', startSec: 0, endSec: 480 }]);
  });
});

describe('encodeWav', () => {
  it('writes a 16-bit PCM WAV whose byte length matches the frame count', () => {
    const mono = new Float32Array([0, 0.5, -0.5, 1]);
    const blob = encodeWav([mono], 8000);
    // 44-byte header + numChannels(1) * frames(4) * 2 bytes
    expect(blob.size).toBe(44 + 1 * 4 * 2);
    expect(blob.type).toBe('audio/wav');
  });
});
