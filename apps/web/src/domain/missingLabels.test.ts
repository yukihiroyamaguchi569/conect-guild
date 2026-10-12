import type { CollectorStatus } from '@conect-guild/snapshot';
import { describe, expect, it } from 'vitest';
import { DEPARTMENT_LABELS, STALE_AFTER_MS } from '../guild.config';
import { missingLabelsBannerText, missingLabelsOf, sameMissingLabels } from './missingLabels';

const AT = '2026-10-12T00:00:00.000Z';
const NOW = Date.parse(AT);

function status(missingLabels?: number[]): CollectorStatus {
  return missingLabels === undefined
    ? { ok: true, attemptedAt: AT }
    : { ok: true, attemptedAt: AT, missingLabels };
}

describe('missingLabelsOf', () => {
  it('is empty with no status or no finding', () => {
    expect(missingLabelsOf(null, NOW)).toEqual([]);
    expect(missingLabelsOf(status(), NOW)).toEqual([]);
  });

  it('names the missing departments from the settings, by position', () => {
    expect(missingLabelsOf(status([1, 3]), NOW)).toEqual([
      { position: 1, label: DEPARTMENT_LABELS[1] },
      { position: 3, label: DEPARTMENT_LABELS[3] },
    ]);
  });

  it('shows a finding next to a failed GitHub fetch too', () => {
    const failed: CollectorStatus = {
      ok: false,
      attemptedAt: AT,
      kind: 'gh-failed',
      missingLabels: [0],
    };
    expect(missingLabelsOf(failed, NOW)).toEqual([{ position: 0, label: DEPARTMENT_LABELS[0] }]);
  });

  it('keeps a finding up to the stale limit, and drops it after (the collector stopped)', () => {
    expect(missingLabelsOf(status([0]), NOW + STALE_AFTER_MS)).toHaveLength(1);
    expect(missingLabelsOf(status([0]), NOW + STALE_AFTER_MS + 1)).toEqual([]);
  });

  it('skips a position the given settings do not have', () => {
    expect(missingLabelsOf(status([0, 2]), NOW, ['経理'])).toEqual([
      { position: 0, label: '経理' },
    ]);
  });
});

describe('sameMissingLabels', () => {
  it('compares the positions', () => {
    const a = [{ position: 1, label: 'x' }];
    expect(sameMissingLabels(a, [{ position: 1, label: 'x' }])).toBe(true);
    expect(sameMissingLabels(a, [{ position: 2, label: 'y' }])).toBe(false);
    expect(sameMissingLabels(a, [])).toBe(false);
    expect(sameMissingLabels([], [])).toBe(true);
  });
});

describe('missingLabelsBannerText', () => {
  it('names each department with its position in the settings', () => {
    expect(
      missingLabelsBannerText([
        { position: 1, label: '広報' },
        { position: 3, label: '総務' },
      ]),
    ).toBe(
      '部門のラベルがリポジトリにありません: 広報（departments[1]）、総務（departments[3]）。この部門の Issue は受付に置かれます',
    );
  });
});
