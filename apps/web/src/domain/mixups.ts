import type { CollectorStatus } from '@conect-guild/snapshot';
import { mixupFindings } from '@conect-guild/snapshot/mixup';
import { DEPARTMENT_LABELS, STALE_AFTER_MS } from '../guild.config';

/**
 * Issue #94: the departments the collector suspects are mixed up in the settings: the PRs on one
 * department's branch prefix keep tying to Issues with another department's label.
 */

/** A department as the banner names it: its position in `departments` and the label set there. */
export interface MixupDepartment {
  readonly position: number;
  readonly label: string;
}

/** Both ways round (`swap`), or one department's PRs tied to another's Issues (`one-way`). */
export type MixupNotice =
  | { readonly kind: 'swap'; readonly a: MixupDepartment; readonly b: MixupDepartment }
  | { readonly kind: 'one-way'; readonly from: MixupDepartment; readonly to: MixupDepartment };

/**
 * The mix-ups to show, or none: no status, no finding, or a status older than `staleAfterMs` (the
 * collector has stopped). The status gives positions only; the names come from the settings the
 * page reads too, and a position they do not have drops its finding. `now` is epoch ms.
 */
export function mixupsOf(
  status: CollectorStatus | null,
  now: number,
  labels: readonly string[] = DEPARTMENT_LABELS,
  staleAfterMs: number = STALE_AFTER_MS,
): MixupNotice[] {
  if (status?.suspectedMixups === undefined) return [];
  if (now - Date.parse(status.attemptedAt) > staleAfterMs) return [];
  const department = (position: number): MixupDepartment | null => {
    const label = labels[position];
    return label === undefined ? null : { position, label };
  };
  return mixupFindings(status.suspectedMixups).flatMap((finding): MixupNotice[] => {
    if (finding.kind === 'swap') {
      const [a, b] = [department(finding.a), department(finding.b)];
      return a === null || b === null ? [] : [{ kind: 'swap', a, b }];
    }
    const [from, to] = [department(finding.from), department(finding.to)];
    return from === null || to === null ? [] : [{ kind: 'one-way', from, to }];
  });
}

function positionsOf(notice: MixupNotice): readonly number[] {
  return notice.kind === 'swap'
    ? [0, notice.a.position, notice.b.position]
    : [1, notice.from.position, notice.to.position];
}

/** True when both tell the same findings, so the page need not change. */
export function sameMixups(a: readonly MixupNotice[], b: readonly MixupNotice[]): boolean {
  return (
    a.length === b.length &&
    a.every((notice, i) => {
      const other = b[i];
      return other !== undefined && positionsOf(notice).join() === positionsOf(other).join();
    })
  );
}

function named({ position, label }: MixupDepartment): string {
  return `${label}（departments[${String(position)}]）`;
}

/** The banner's words, e.g. 「部門の設定が入れ替わっているかもしれません: 広報（departments[1]）と…」. */
export function mixupsBannerText(notices: readonly MixupNotice[]): string {
  const findings = notices.map((notice) =>
    notice.kind === 'swap'
      ? `${named(notice.a)}と${named(notice.b)}の接頭辞の PR が、互いに相手のラベルの Issue に結び付いています`
      : `${named(notice.from)}の接頭辞の PR が、${named(notice.to)}のラベルの Issue に結び付いています`,
  );
  return `部門の設定が入れ替わっているかもしれません: ${findings.join('。')}`;
}
