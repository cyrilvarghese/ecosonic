/** Encode per-channel float samples as a 16-bit PCM WAV file (values clamped to [−1, 1]).
 *  All channels must share the same length; they are interleaved frame by frame. */
export function encodeWavPcm16(channels: Float32Array[], sampleRate: number): ArrayBuffer {
  const numCh = channels.length;
  const frames = channels[0]?.length ?? 0;
  const dataBytes = frames * numCh * 2;
  const buf = new ArrayBuffer(44 + dataBytes);
  const v = new DataView(buf);
  const w4 = (off: number, s: string) => { for (let i = 0; i < 4; i++) v.setUint8(off + i, s.charCodeAt(i)); };
  w4(0, 'RIFF'); v.setUint32(4, 36 + dataBytes, true); w4(8, 'WAVE');
  w4(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, numCh, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * numCh * 2, true);
  v.setUint16(32, numCh * 2, true); v.setUint16(34, 16, true);
  w4(36, 'data'); v.setUint32(40, dataBytes, true);
  let off = 44;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < numCh; c++) {
      const x = Math.max(-1, Math.min(1, channels[c][i]));
      v.setInt16(off, Math.round(x < 0 ? x * 0x8000 : x * 0x7fff), true);
      off += 2;
    }
  }
  return buf;
}
