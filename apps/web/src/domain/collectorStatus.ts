import type { CollectorFailureKind, CollectorStatus } from '@conect-guild/snapshot';
import { STALE_AFTER_MS } from '../guild.config';

/**
 * The collector's own status (Issue #74), for the automatic demo: while nothing is collected, it
 * tells "the collector has not run" from "the collector runs and fails".
 */

/** The kinds in short Japanese, for the banner. */
const FAILURE_LABELS: Readonly<Record<CollectorFailureKind, string>> = {
  'gh-failed': '認証・取得',
  'validation-failed': 'データの検証',
  'write-failed': 'ファイルの書き込み',
  unexpected: '想定外のエラー',
};

/**
 * The failure to show, or null: no status (the collector has not run), a success, or a status
 * older than `staleAfterMs` (the collector tries once a minute, so it has stopped since: the same
 * as not running). `now` is epoch ms.
 */
export function collectorFailureOf(
  status: CollectorStatus | null,
  now: number,
  staleAfterMs: number = STALE_AFTER_MS,
): CollectorFailureKind | null {
  if (status === null || status.ok) return null;
  return now - Date.parse(status.attemptedAt) > staleAfterMs ? null : status.kind;
}

const DEMO_LEAD = 'デモ表示中（架空のデータ）。';

/** The automatic demo's banner: as before (Issue #67), or the collector's failure. */
export function autoDemoBannerText(failure: CollectorFailureKind | null): string {
  if (failure === null) return `${DEMO_LEAD}データを集めると自分のリポジトリに切り替わります`;
  return `${DEMO_LEAD}${collectorFailureText(failure)}`;
}

function collectorFailureText(failure: CollectorFailureKind): string {
  return `collector が失敗しています（${FAILURE_LABELS[failure]}）。ターミナルを確認してください`;
}

/** What the browser console gets in the automatic demo: a hint, or a warning. Never an error. */
export interface ConsoleNotice {
  readonly level: 'info' | 'warn';
  readonly text: string;
}

const CONSOLE_PREFIX = '[conect-guild]';

/** Logged once when the automatic demo starts because nothing is collected yet. */
export const AUTO_DEMO_NOTICE: ConsoleNotice = {
  level: 'info',
  text: `${CONSOLE_PREFIX} collector がまだデータを書いていないので、デモ（架空のデータ）を表示しています。npm run collect（または npm run dev:all）で集めると、自分のリポジトリに切り替わります`,
};

/**
 * The warning for a change of the shown failure: the banner's words and the kind. null when it
 * did not change, or when the failure is gone (the banner says so by itself).
 */
export function collectorFailureNotice(
  previous: CollectorFailureKind | null,
  next: CollectorFailureKind | null,
): ConsoleNotice | null {
  if (next === null || next === previous) return null;
  return { level: 'warn', text: `${CONSOLE_PREFIX} ${collectorFailureText(next)}（${next}）` };
}
