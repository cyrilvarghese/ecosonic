import { describe, it, expect } from 'vitest';
import { encodeWavPcm16 } from '@/audio/wavEncode';

describe('encodeWavPcm16', () => {
  it('writes a correct RIFF/WAVE header and PCM16 payload', () => {
    const left = new Float32Array([0, 1, -1]);
    const right = new Float32Array([0.5, 2, -2]); // out-of-range values clamp
    const buf = encodeWavPcm16([left, right], 44100);
    const v = new DataView(buf);
    const tag = (off: number) => String.fromCharCode(v.getUint8(off), v.getUint8(off + 1), v.getUint8(off + 2), v.getUint8(off + 3));
    expect(tag(0)).toBe('RIFF');
    expect(tag(8)).toBe('WAVE');
    expect(tag(12)).toBe('fmt ');
    expect(tag(36)).toBe('data');
    expect(v.getUint16(22, true)).toBe(2);        // channels
    expect(v.getUint32(24, true)).toBe(44100);    // sample rate
    expect(v.getUint32(40, true)).toBe(3 * 2 * 2); // data bytes = frames × ch × 2
    expect(buf.byteLength).toBe(44 + 12);
    expect(v.getInt16(44, true)).toBe(0);          // L frame 0
    expect(v.getInt16(46, true)).toBe(16384);      // R frame 0 = round(0.5 × 0x7fff = 16383.5)
    expect(v.getInt16(48, true)).toBe(32767);      // L frame 1 (1 → max)
    expect(v.getInt16(50, true)).toBe(32767);      // R frame 1 (2 clamps to max)
    expect(v.getInt16(52, true)).toBe(-32768);     // L frame 2 (−1 → min)
    expect(v.getInt16(54, true)).toBe(-32768);     // R frame 2 (−2 clamps to min)
  });
});
