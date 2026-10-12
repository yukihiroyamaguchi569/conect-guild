import type { CollectorStatus } from '@conect-guild/snapshot';
import { describe, expect, it } from 'vitest';
import { STALE_AFTER_MS } from '../guild.config';
import {
  AUTO_DEMO_NOTICE,
  autoDemoBannerText,
  collectorFailureNotice,
  collectorFailureOf,
} from './collectorStatus';

const AT = '2026-10-12T00:00:00.000Z';
const NOW = Date.parse(AT);

function failed(kind: 'gh-failed' | 'validation-failed' = 'gh-failed'): CollectorStatus {
  return { ok: false, attemptedAt: AT, kind };
}

describe('collectorFailureOf', () => {
  it('is null with no status (the collector has not run) and after a success', () => {
    expect(collectorFailureOf(null, NOW)).toBeNull();
    expect(collectorFailureOf({ ok: true, attemptedAt: AT }, NOW)).toBeNull();
  });

  it('is the kind of a recent failure', () => {
    expect(collectorFailureOf(failed(), NOW)).toBe('gh-failed');
    expect(collectorFailureOf(failed('validation-failed'), NOW + 60_000)).toBe('validation-failed');
  });

  it('keeps a failure up to the stale limit, and drops it after (the collector stopped)', () => {
    expect(collectorFailureOf(failed(), NOW + STALE_AFTER_MS)).toBe('gh-failed');
    expect(collectorFailureOf(failed(), NOW + STALE_AFTER_MS + 1)).toBeNull();
    expect(collectorFailureOf(failed(), NOW + 1_000, 999)).toBeNull();
  });

  it('keeps a failure from a clock ahead of the page', () => {
    expect(collectorFailureOf(failed(), NOW - 60_000)).toBe('gh-failed');
  });
});

describe('autoDemoBannerText', () => {
  it('stays as before with no failure', () => {
    expect(autoDemoBannerText(null)).toBe(
      'デモ表示中（架空のデータ）。データを集めると自分のリポジトリに切り替わります',
    );
  });

  it.each([
    ['gh-failed', '認証・取得'],
    ['validation-failed', 'データの検証'],
    ['write-failed', 'ファイルの書き込み'],
    ['unexpected', '想定外のエラー'],
  ] as const)('names %s in short Japanese', (kind, label) => {
    expect(autoDemoBannerText(kind)).toBe(
      `デモ表示中（架空のデータ）。collector が失敗しています（${label}）。ターミナルを確認してください`,
    );
  });
});

describe('console notices', () => {
  it('starts the automatic demo with one hint, not an error', () => {
    expect(AUTO_DEMO_NOTICE.level).toBe('info');
    expect(AUTO_DEMO_NOTICE.text).toContain('npm run collect');
    expect(AUTO_DEMO_NOTICE.text).not.toContain('\n');
  });

  it('warns with the banner words and the kind when a failure appears', () => {
    expect(collectorFailureNotice(null, 'gh-failed')).toEqual({
      level: 'warn',
      text: '[conect-guild] collector が失敗しています（認証・取得）。ターミナルを確認してください（gh-failed）',
    });
  });

  it('warns again when the kind changes', () => {
    const notice = collectorFailureNotice('gh-failed', 'validation-failed');
    expect(notice?.level).toBe('warn');
    expect(notice?.text).toContain('（validation-failed）');
  });

  it('is silent when nothing changed or the failure is gone', () => {
    expect(collectorFailureNotice('gh-failed', 'gh-failed')).toBeNull();
    expect(collectorFailureNotice('gh-failed', null)).toBeNull();
    expect(collectorFailureNotice(null, null)).toBeNull();
  });
});
