import { config } from '@/config';
import type { Mode } from '@/arrange/types';

const MODE_ORDER: readonly Mode[] = ['INTRODUCTION', 'DEEP_RELAXATION', 'RETURN'];

/** Fixed 10-min clock windows. Drops any window that starts past the track end;
 *  clamps the final window's end to the track duration. Pure. */
export function sliceWindows(
  durationSec: number,
  moduleSeconds: number = config.layerTwo.moduleSeconds,
): Array<{ mode: Mode; startSec: number; endSec: number }> {
  const out: Array<{ mode: Mode; startSec: number; endSec: number }> = [];
  for (let i = 0; i < MODE_ORDER.length; i++) {
    const startSec = i * moduleSeconds;
    if (startSec >= durationSec) break;
    const endSec = Math.min((i + 1) * moduleSeconds, durationSec);
    out.push({ mode: MODE_ORDER[i], startSec, endSec });
  }
  return out;
}

/** Minimal 16-bit PCM WAV encoder — no deps. Interleaves channels. */
export function encodeWav(channels: Float32Array[], sampleRate: number): Blob {
  const numChannels = channels.length;
  const frames = channels[0]?.length ?? 0;
  const buffer = new ArrayBuffer(44 + frames * numChannels * 2);
  const view = new DataView(buffer);
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  const byteRate = sampleRate * numChannels * 2;
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + frames * numChannels * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);       // PCM chunk size
  view.setUint16(20, 1, true);        // audio format = PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, numChannels * 2, true); // block align
  view.setUint16(34, 16, true);       // bits per sample
  writeStr(36, 'data');
  view.setUint32(40, frames * numChannels * 2, true);
  let offset = 44;
  for (let f = 0; f < frames; f++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const s = Math.max(-1, Math.min(1, channels[ch][f]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([buffer], { type: 'audio/wav' });
}
