import { describe, it, expect } from 'vitest';
import { toWebExt, isLossless } from './webAudioExt';

// The transcode script and resolveSampleUrl must agree exactly: the script names the files this
// rule predicts, and the player asks for the names this rule produces. One rule, both callers.
describe('toWebExt', () => {
  it('sends ordinary samples to AAC', () => {
    expect(toWebExt('EARTH/PAD/BOWLS.wav')).toBe('EARTH/PAD/BOWLS.m4a');
  });

  it('sends mp3 sources to AAC too, so the pool is one format', () => {
    expect(toWebExt('WATER/FX/rain.mp3')).toBe('WATER/FX/rain.m4a');
  });

  it('keeps ISO lossless — joint-stereo coding would destroy the binaural beat', () => {
    expect(toWebExt('EARTH/ISO/1hz.wav')).toBe('EARTH/ISO/1hz.flac');
  });

  it('matches ISO as a whole path segment, not a substring', () => {
    // 'ISOLATED' starts with ISO; treating that as binaural material would waste ~4x the bytes.
    expect(toWebExt('EARTH/ISOLATED/hum.wav')).toBe('EARTH/ISOLATED/hum.m4a');
  });

  it('finds ISO at any depth', () => {
    expect(toWebExt('WATER/ISO/deep/2hz.wav')).toBe('WATER/ISO/deep/2hz.flac');
  });

  it('leaves the stem alone, including dots and spaces', () => {
    expect(toWebExt('EARTH/ELEMENT/FROG & BIRDS v2.wav')).toBe('EARTH/ELEMENT/FROG & BIRDS v2.m4a');
  });
});

describe('isLossless', () => {
  it('is what the transcode script branches its encoder on', () => {
    expect(isLossless('EARTH/ISO/1hz.wav')).toBe(true);
    expect(isLossless('EARTH/PAD/BOWLS.wav')).toBe(false);
  });
});
