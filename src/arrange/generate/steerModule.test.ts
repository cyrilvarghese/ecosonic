import { describe, it, expect } from 'vitest';
import { steerModule, nudgeOptions, IN_NEXT_DELAY_SEC } from '@/arrange/generate/steerModule';
import { generateModeTemplate } from '@/arrange/generate/generateModeTemplate';
import { validateTemplate } from '@/arrange/generate/validateTemplate';
import type { ArrTrack } from '@/arrange/types';
import { config } from '@/config';

const D = config.layerTwo.moduleSeconds;
const t = (id: string, category: ArrTrack['category']): ArrTrack => ({
  id, category, label: id, sample: { name: id, path: id, bytes: 1 }, ceilingDb: 0, locked: false,
});
const introTracks: ArrTrack[] = [
  t('n', 'NOISE'), t('e', 'ELEMENT'), t('iso', 'ISO'), t('pl', 'PLANET'),
  t('pad', 'PAD'), t('bass', 'BASS'), t('arp', 'ARP'), t('mel', 'MELODY'),
];
const base = (seed = 1) => generateModeTemplate(introTracks, 'INTRODUCTION', 'MODERATE', seed).regions;
const find = (rs: ReturnType<typeof base>, id: string) => rs.find((r) => r.trackId === id);

describe('steerModule', () => {
  it('is deterministic — same inputs yield the same splice', () => {
    const rs = base(3);
    const a = steerModule(rs, 300, introTracks, 'INTRODUCTION', 'MODERATE', 42);
    const b = steerModule(rs, 300, introTracks, 'INTRODUCTION', 'MODERATE', 42);
    expect(a).toEqual(b);
  });
  it('preserves the past verbatim and keeps active entrances/fade-ins', () => {
    const rs = base(5);
    const out = steerModule(rs, 300, introTracks, 'INTRODUCTION', 'EXPLORATORY', 7);
    for (const r of rs) {
      const o = find(out, r.trackId);
      if (r.exitSec <= 300) expect(o).toEqual(r); // fully past: untouched
      else if (r.enterSec <= 300) {               // active: entrance history kept
        expect(o!.enterSec).toBe(r.enterSec);
        expect(o!.fadeInSec).toBe(r.fadeInSec);
        expect(o!.exitSec).toBeGreaterThanOrEqual(300);
      }
    }
  });
  it('pending layers redraw with enter strictly after the playhead', () => {
    const rs = base(2);
    const out = steerModule(rs, 200, introTracks, 'INTRODUCTION', 'MODERATE', 11);
    for (const r of rs) {
      if (r.enterSec > 200) expect(find(out, r.trackId)!.enterSec).toBeGreaterThan(200);
    }
  });
  it('spliced results stay invariant-legal (I1–I6) across seeds and playheads', () => {
    for (let s = 0; s < 30; s++) {
      const rs = base(s);
      for (const at of [90, 240, 420]) {
        const out = steerModule(rs, at, introTracks, 'INTRODUCTION', 'MODERATE', s + 100);
        const res = validateTemplate({ mode: 'INTRODUCTION', regions: out }, introTracks);
        expect(res.ok, `seed ${s} @ ${at}s: ${JSON.stringify(res.violations)}`).toBe(true);
      }
    }
  });
  it('a plain steer never adds a layer that was not in the arrangement', () => {
    const rs = base(4).filter((r) => r.trackId !== 'mel');
    const out = steerModule(rs, 200, introTracks, 'INTRODUCTION', 'EXPLORATORY', 9);
    expect(find(out, 'mel')).toBeUndefined();
  });
  it('IN_NEXT brings an eligible pending layer in near now — even a dropped one', () => {
    const rs = base(4).filter((r) => r.trackId !== 'mel'); // MELODY dropped
    const out = steerModule(rs, 480, introTracks, 'INTRODUCTION', 'MODERATE', 9, { kind: 'IN_NEXT', trackId: 'mel' });
    const mel = find(out, 'mel')!;
    expect(mel.enterSec).toBeCloseTo(480 + IN_NEXT_DELAY_SEC, 5);
    expect(mel.exitSec).toBeGreaterThan(mel.enterSec);
  });
  it('HOLD_BACK pushes a pending entrance later than any un-nudged draw', () => {
    // Ensure MELODY exists and is pending regardless of the seed's presence roll.
    const rs = base(6).filter((r) => r.trackId !== 'mel');
    rs.push({ trackId: 'mel', enterSec: 390, exitSec: 540, fadeInSec: 60, fadeOutSec: 60 });
    const at = 300; // MELODY (canon 390) is pending here
    const plain = steerModule(rs, at, introTracks, 'INTRODUCTION', 'MODERATE', 21);
    const held = steerModule(rs, at, introTracks, 'INTRODUCTION', 'MODERATE', 21, { kind: 'HOLD_BACK', trackId: 'mel' });
    expect(find(held, 'mel')!.enterSec).toBeGreaterThan(find(plain, 'mel')!.enterSec);
  });
  it('squeeze rule: a pending non-bed layer with no room left is dropped; the bed survives', () => {
    const rs = base(8);
    const out = steerModule(rs, D - 10, introTracks, 'INTRODUCTION', 'MODERATE', 13);
    const melIn = rs.find((r) => r.trackId === 'mel');
    if (melIn && melIn.enterSec > D - 10) expect(find(out, 'mel')).toBeUndefined();
    expect(find(out, 'n')).toBeDefined(); // NOISE (bed) always present
  });
  it('BASS still enters with no fade-in after a steer (data-driven R4)', () => {
    // Steer early enough that BASS (canon 240) is still pending.
    const rs = base(7);
    const out = steerModule(rs, 60, introTracks, 'INTRODUCTION', 'MODERATE', 17);
    expect(find(out, 'bass')!.fadeInSec).toBe(0);
  });
});

describe('nudgeOptions', () => {
  it('an entered layer gets no nudges', () => {
    const rs = base(1); // NOISE enters at 0
    expect(nudgeOptions(introTracks[0], rs, introTracks, 'INTRODUCTION', 100)).toEqual({ inNext: false, holdBack: false });
  });
  it('a pending layer whose `after` is active can come in; one whose `after` is pending cannot', () => {
    const rs = base(1);
    const iso = find(rs, 'iso')!;
    const beforeIso = Math.max(0, iso.enterSec - 30); // ISO not yet entered
    const pl = introTracks.find((x) => x.id === 'pl')!; // PLANET.after = ISO
    expect(nudgeOptions(pl, rs, introTracks, 'INTRODUCTION', beforeIso).inNext).toBe(false);
    const afterIso = iso.enterSec + 10; // ISO active now
    if (find(rs, 'pl')!.enterSec > afterIso) {
      expect(nudgeOptions(pl, rs, introTracks, 'INTRODUCTION', afterIso).inNext).toBe(true);
    }
  });
  it('holdBack requires an existing pending region', () => {
    const rs = base(1).filter((r) => r.trackId !== 'mel');
    const mel = introTracks.find((x) => x.id === 'mel')!;
    expect(nudgeOptions(mel, rs, introTracks, 'INTRODUCTION', 300).holdBack).toBe(false);
  });
});
