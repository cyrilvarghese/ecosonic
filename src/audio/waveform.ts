/** Map time-domain bytes (0..255, silence at 128) to a [-1, 1] curve. */
export function normalizeWaveform(bytes: Uint8Array): number[] {
  const out = new Array<number>(bytes.length);
  for (let i = 0; i < bytes.length; i++) out[i] = (bytes[i] - 128) / 128;
  return out;
}
