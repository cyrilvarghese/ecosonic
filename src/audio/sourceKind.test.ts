import { describe, it, expect } from 'vitest';
import { chooseSourceKind } from '@/audio/sourceKind';

describe('chooseSourceKind', () => {
  it('decodes files below the threshold', () => {
    expect(chooseSourceKind(1_000_000, 8_388_608)).toBe('buffer');
  });
  it('streams files at or above the threshold', () => {
    expect(chooseSourceKind(8_388_608, 8_388_608)).toBe('stream');
    expect(chooseSourceKind(170_000_000, 8_388_608)).toBe('stream');
  });
});
