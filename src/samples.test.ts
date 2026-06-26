import { describe, it, expect } from 'vitest';
import { resolveSampleUrl } from '@/samples';

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
