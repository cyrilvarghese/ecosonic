/** Map time-domain bytes (0..255, silence at 128) to a [-1, 1] curve. */
export function normalizeWaveform(bytes: Uint8Array): number[] {
  const out = new Array<number>(bytes.length);
  for (let i = 0; i < bytes.length; i++) out[i] = (bytes[i] - 128) / 128;
  return out;
}

/**
 * Visual exaggeration for the oscilloscope. Quiet streams barely move a raw
 * [-1,1] trace, so we multiply amplitude by this gain before drawing. Bump it
 * to make the waveform swing harder; lower it to calm things down.
 */
export const WAVEFORM_VISUAL_GAIN = 3.2;

/** Fraction of the half-height a peak is allowed to reach (keeps it off the edge). */
const WAVEFORM_HEADROOM = 0.9;

/**
 * Map a normalized amplitude [-1, 1] to a canvas y within a lane of height `h`.
 * Applies visual gain with soft (tanh) saturation: small amplitudes are boosted
 * so the signal is legible, while peaks compress smoothly toward the edge instead
 * of clipping flat against it. Centered on h/2 (silence sits on the mid-line).
 */
export function amplitudeToY(amp: number, h: number, gain: number = WAVEFORM_VISUAL_GAIN): number {
  const shaped = Math.tanh(amp * gain);
  return h / 2 + shaped * (h / 2) * WAVEFORM_HEADROOM;
}
