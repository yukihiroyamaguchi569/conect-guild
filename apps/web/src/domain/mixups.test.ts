import type { CollectorStatus } from '@conect-guild/snapshot';
import { describe, expect, it } from 'vitest';
import { DEPARTMENT_LABELS, STALE_AFTER_MS } from '../guild.config';
import { mixupsBannerText, mixupsOf, sameMixups, type MixupNotice } from './mixups';

/** Issue #94: the suspected mix-ups of departments on the live screen. */

const AT = '2026-10-12T00:00:00.000Z';
const NOW = Date.parse(AT);

function status(suspectedMixups?: { from: number; to: number }[]): CollectorStatus {
  return suspectedMixups === undefined
    ? { ok: true, attemptedAt: AT }
    : { ok: true, attemptedAt: AT, suspectedMixups };
}

const SWAP = [
  { from: 1, to: 2 },
  { from: 2, to: 1 },
];

describe('mixupsOf', () => {
  it('is empty with no status or no finding', () => {
    expect(mixupsOf(null, NOW)).toEqual([]);
    expect(mixupsOf(status(), NOW)).toEqual([]);
  });

  it('tells both ways round as a swap, named from the settings', () => {
    expect(mixupsOf(status(SWAP), NOW)).toEqual([
      {
        kind: 'swap',
        a: { position: 1, label: DEPARTMENT_LABELS[1] },
        b: { position: 2, label: DEPARTMENT_LABELS[2] },
      },
    ]);
  });

  it('tells one way as it is', () => {
    expect(mixupsOf(status([{ from: 3, to: 0 }]), NOW)).toEqual([
      {
        kind: 'one-way',
        from: { position: 3, label: DEPARTMENT_LABELS[3] },
        to: { position: 0, label: DEPARTMENT_LABELS[0] },
      },
    ]);
  });

  it('shows a finding next to a failed GitHub fetch too', () => {
    const failed: CollectorStatus = {
      ok: false,
      attemptedAt: AT,
      kind: 'gh-failed',
      suspectedMixups: SWAP,
    };
    expect(mixupsOf(failed, NOW)).toHaveLength(1);
  });

  it('keeps a finding up to the stale limit, and drops it after (the collector stopped)', () => {
    expect(mixupsOf(status(SWAP), NOW + STALE_AFTER_MS)).toHaveLength(1);
    expect(mixupsOf(status(SWAP), NOW + STALE_AFTER_MS + 1)).toEqual([]);
  });

  it('drops a finding with a position the given settings do not have', () => {
    expect(mixupsOf(status(SWAP), NOW, ['経理', '広報'])).toEqual([]);
    expect(mixupsOf(status([{ from: 0, to: 3 }]), NOW, ['経理', '広報'])).toEqual([]);
    expect(mixupsOf(status([{ from: 3, to: 0 }]), NOW, ['経理', '広報'])).toEqual([]);
    expect(mixupsOf(status([{ from: 0, to: 1 }]), NOW, ['A', 'B'])).toEqual([
      { kind: 'one-way', from: { position: 0, label: 'A' }, to: { position: 1, label: 'B' } },
    ]);
  });
});

describe('sameMixups', () => {
  const swap: MixupNotice = {
    kind: 'swap',
    a: { position: 1, label: 'x' },
    b: { position: 2, label: 'y' },
  };
  const oneWay: MixupNotice = {
    kind: 'one-way',
    from: { position: 1, label: 'x' },
    to: { position: 2, label: 'y' },
  };

  it('compares the kinds and the positions', () => {
    expect(sameMixups([swap], [{ ...swap }])).toBe(true);
    expect(sameMixups([swap], [oneWay])).toBe(false);
    expect(sameMixups([swap], [{ ...swap, b: { position: 3, label: 'y' } }])).toBe(false);
    expect(sameMixups([swap], [])).toBe(false);
    expect(sameMixups([], [])).toBe(true);
  });
});

describe('mixupsBannerText', () => {
  it('tells a swap', () => {
    expect(mixupsOf(status(SWAP), NOW, ['経理', '広報', '企画', '総務'])).toHaveLength(1);
    expect(mixupsBannerText(mixupsOf(status(SWAP), NOW, ['経理', '広報', '企画', '総務']))).toBe(
      '部門の設定が入れ替わっているかもしれません: 広報（departments[1]）と企画（departments[2]）の接頭辞の PR が、互いに相手のラベルの Issue に結び付いています',
    );
  });

  it('tells a one-way mix-up, and several findings one after another', () => {
    const notices = mixupsOf(
      status([
        { from: 0, to: 3 },
        { from: 1, to: 2 },
      ]),
      NOW,
      ['経理', '広報', '企画', '総務'],
    );
    expect(mixupsBannerText(notices)).toBe(
      '部門の設定が入れ替わっているかもしれません: 経理（departments[0]）の接頭辞の PR が、総務（departments[3]）のラベルの Issue に結び付いています。広報（departments[1]）の接頭辞の PR が、企画（departments[2]）のラベルの Issue に結び付いています',
    );
  });
});
