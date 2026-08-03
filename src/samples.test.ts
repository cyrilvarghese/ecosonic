import { describe, it, expect, vi, afterEach } from 'vitest';
import { resolveSampleUrl } from '@/samples';

afterEach(() => { vi.unstubAllEnvs(); });

describe('resolveSampleUrl', () => {
  it('encodes each path segment but keeps slashes', () => {
    expect(resolveSampleUrl('WATER/NOISE/NOISE WATER.wav'))
      .toBe('/api/samples/WATER/NOISE/NOISE%20WATER.wav');
  });
  it('encodes ampersands', () => {
    expect(resolveSampleUrl('EARTH/ELEMENT/SUB/FROG&BIRDS.wav'))
      .toBe('/api/samples/EARTH/ELEMENT/SUB/FROG%26BIRDS.wav');
  });
});

// Hosted, there is no /api/samples: the app is a static export and the audio lives in R2 under
// the names the transcode gave it.
describe('resolveSampleUrl, hosted', () => {
  const R2 = 'https://pub-example.r2.dev';

  it('points at the bucket and takes the transcoded extension', () => {
    vi.stubEnv('NEXT_PUBLIC_SAMPLE_BASE_URL', R2);
    expect(resolveSampleUrl('EARTH/PAD/BOWLS.wav')).toBe(`${R2}/EARTH/PAD/BOWLS.m4a`);
  });

  it('keeps ISO lossless, matching what was uploaded', () => {
    vi.stubEnv('NEXT_PUBLIC_SAMPLE_BASE_URL', R2);
    expect(resolveSampleUrl('ETHER/ISO/33hz.wav')).toBe(`${R2}/ETHER/ISO/33hz.flac`);
  });

  it('still encodes segments, since keys carry spaces and ampersands', () => {
    vi.stubEnv('NEXT_PUBLIC_SAMPLE_BASE_URL', R2);
    expect(resolveSampleUrl('EARTH/ELEMENT/SUB/FROG&BIRDS.wav'))
      .toBe(`${R2}/EARTH/ELEMENT/SUB/FROG%26BIRDS.m4a`);
  });

  it('tolerates a base URL with a trailing slash', () => {
    vi.stubEnv('NEXT_PUBLIC_SAMPLE_BASE_URL', `${R2}/`);
    expect(resolveSampleUrl('EARTH/PAD/BOWLS.wav')).toBe(`${R2}/EARTH/PAD/BOWLS.m4a`);
  });
});
