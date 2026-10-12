import type { CollectorStatus } from '@conect-guild/snapshot';
import { DEPARTMENT_LABELS, STALE_AFTER_MS } from '../guild.config';

/**
 * Issue #85: the department labels of the settings that the repository does not have, as the
 * collector found them. Its Issues with such a label never get one the collector can tie to the
 * department, so they stay at the reception.
 */

/** A department whose label is missing: its position in `departments` and the label set there. */
export interface MissingLabel {
  readonly position: number;
  readonly label: string;
}

/**
 * The missing labels to show, or none: no status, no finding, or a status older than
 * `staleAfterMs` (the collector has stopped, so its finding may be out of date). The status gives
 * positions only; the names come from the settings the page reads too. `now` is epoch ms.
 */
export function missingLabelsOf(
  status: CollectorStatus | null,
  now: number,
  labels: readonly string[] = DEPARTMENT_LABELS,
  staleAfterMs: number = STALE_AFTER_MS,
): MissingLabel[] {
  if (status?.missingLabels === undefined) return [];
  if (now - Date.parse(status.attemptedAt) > staleAfterMs) return [];
  return status.missingLabels.flatMap((position) => {
    const label = labels[position];
    return label === undefined ? [] : [{ position, label }];
  });
}

/** True when both name the same departments, so the page need not change. */
export function sameMissingLabels(a: readonly MissingLabel[], b: readonly MissingLabel[]): boolean {
  return a.length === b.length && a.every((item, i) => item.position === b[i]?.position);
}

/** The banner's words, e.g. 「部門のラベルがリポジトリにありません: 広報（departments[1]）。…」. */
export function missingLabelsBannerText(missing: readonly MissingLabel[]): string {
  const names = missing
    .map(({ position, label }) => `${label}（departments[${String(position)}]）`)
    .join('、');
  return `部門のラベルがリポジトリにありません: ${names}。この部門の Issue は受付に置かれます`;
}
