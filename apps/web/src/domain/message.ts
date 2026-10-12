import type { Snapshot } from '@conect-guild/snapshot';
import { departmentMember, MEMBERS, type DepartmentLabel } from '../guild.config';
import type { DiffResult, GuildEvent } from './events';

/** Name of the member who acts for a department; かなめ handles the reception (no department). */
export function actorName(department: DepartmentLabel | null): string {
  return department === null ? MEMBERS.kaname.name : MEMBERS[departmentMember(department)].name;
}

/** `「title」` right after the number, or a plain space when the title is unknown. */
function quoted(title: string | undefined): string {
  return title === undefined ? ' ' : `「${title}」`;
}

function titleOf(
  event: GuildEvent,
  snapshot: Pick<Snapshot, 'issues' | 'prs'>,
): string | undefined {
  const items = event.kind === 'pr-merged' ? snapshot.prs : snapshot.issues;
  return items.find((item) => item.number === event.number)?.title;
}

/**
 * One line for the message window, e.g. `ささえは クエスト#98「…」を クリアした！`. A level-up has
 * no title or number: `みのりは レベル 10 に あがった！`.
 */
export function eventMessage(
  event: GuildEvent,
  snapshot: Pick<Snapshot, 'issues' | 'prs'>,
): string {
  const n = String(event.number);
  const actor = actorName(event.department);
  if (event.kind === 'level-up') return `${actor}は レベル ${n} に あがった！`;
  const title = quoted(titleOf(event, snapshot));
  const kaname = MEMBERS.kaname.name;
  switch (event.kind) {
    case 'issue-closed':
      return `${actor}は クエスト#${n}${title}を クリアした！`;
    case 'pr-merged':
      return event.department === null
        ? `${kaname}の受付に PR#${n}${title}が とどいた！`
        : `${actor}は PR#${n}${title}を ${kaname}に とどけた！`;
    case 'issue-opened':
      return event.department === null
        ? `${kaname}の受付に クエスト#${n}${title}が とどいた！`
        : `${kaname}は ${actor}に クエスト#${n}${title}を わたした！`;
  }
}

/** A message window line and the event it reports (null for a notice). */
export interface MessageEntry {
  readonly text: string;
  readonly event: GuildEvent | null;
}

/** The diff's notice (if any) first, then one entry per event, in the diff's order. */
export function diffEntries(
  diff: DiffResult,
  snapshot: Pick<Snapshot, 'issues' | 'prs'>,
): MessageEntry[] {
  const entries = diff.events.map((event) => ({ text: eventMessage(event, snapshot), event }));
  return diff.notice === null ? entries : [{ text: diff.notice.message, event: null }, ...entries];
}

/** The diff's notice (if any) first, then one line per event, in the diff's order. */
export function diffMessages(
  diff: DiffResult,
  snapshot: Pick<Snapshot, 'issues' | 'prs'>,
): string[] {
  return diffEntries(diff, snapshot).map((entry) => entry.text);
}
