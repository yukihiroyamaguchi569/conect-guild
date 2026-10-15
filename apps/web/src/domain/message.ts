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

/** What the message window calls the king (Issue #142). */
const KING = 'おうさま';

/** The snapshot lists a message reads its title from. */
type TitleSource = Pick<Snapshot, 'issues' | 'prs' | 'president'>;

/** A cleared king's quest is no longer in the snapshot: it has no title. */
function itemsOf(
  event: GuildEvent,
  snapshot: TitleSource,
): readonly { number: number; title: string }[] {
  if (event.kind === 'pr-merged') return snapshot.prs;
  if (event.kind === 'king-quest-opened') return snapshot.president?.issues ?? [];
  return event.kind === 'king-quest-cleared' ? [] : snapshot.issues;
}

function titleOf(event: GuildEvent, snapshot: TitleSource): string | undefined {
  const items = itemsOf(event, snapshot);
  return items.find((item) => item.number === event.number)?.title;
}

/**
 * One line for the message window, e.g. `ささえは クエスト#98「…」を クリアした！`. A level-up has
 * no title or number: `みのりは レベル 10 に あがった！`. The king's quests (Issue #142):
 * `おうさまに クエスト#7「…」が とどいた！` and `おうさまは クエスト#7 を クリアした！`.
 */
export function eventMessage(event: GuildEvent, snapshot: TitleSource): string {
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
    case 'king-quest-opened':
      return `${KING}に クエスト#${n}${title}が とどいた！`;
    case 'king-quest-cleared':
      return `${KING}は クエスト#${n}${title}を クリアした！`;
  }
}

/** A message window line and the event it reports (null for a notice). */
export interface MessageEntry {
  readonly text: string;
  readonly event: GuildEvent | null;
  /** The guest (its position in the settings) whose PR or Issue the line reports (Issue #108). */
  readonly guest?: number;
}

/** The diff's notice (if any) first, then one entry per event, in the diff's order. */
export function diffEntries(diff: DiffResult, snapshot: TitleSource): MessageEntry[] {
  const entries = diff.events.map((event) => ({ text: eventMessage(event, snapshot), event }));
  return diff.notice === null ? entries : [{ text: diff.notice.message, event: null }, ...entries];
}

/** The diff's notice (if any) first, then one line per event, in the diff's order. */
export function diffMessages(diff: DiffResult, snapshot: TitleSource): string[] {
  return diffEntries(diff, snapshot).map((entry) => entry.text);
}
