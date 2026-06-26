/** Convert decibels to a linear gain multiplier. At or below `minDb` returns 0 (silence). */
export function dbToGain(db: number, minDb: number): number {
  return db <= minDb ? 0 : Math.pow(10, db / 20);
}

/** Clamp a dB value into the [minDb, maxDb] range. */
export function clampDb(db: number, minDb: number, maxDb: number): number {
  return Math.min(maxDb, Math.max(minDb, db));
}
