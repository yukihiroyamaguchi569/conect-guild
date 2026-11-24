import type { Snapshot } from '@conect-guild/snapshot';
import { departmentMember, MEMBERS, type MemberConfig, type MemberId } from '../guild.config';
import { daysToDeadline, daysToDoDay, monthDayAfter } from '../domain/deadline';
import { prWaitKind, type PrWaitKind } from '../domain/party';
import type { BoardGroup } from './guildView';

/**
 * The quest card (Issue #267): what the card of a board row shows. Pure: the board groups decide
 * who is in charge (the same as the board's sections), the snapshot's fetch is the time to judge
 * from. No body, no comments.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Days open from which a quest is rare and super rare (one place: the president may change them). */
export const RARITY_DAYS = { rare: 7, superRare: 30 } as const;

export type Rarity = 'normal' | 'rare' | 'super-rare';

export const RARITY_LABELS: Readonly<Record<Rarity, string>> = {
  normal: 'ノーマル',
  rare: 'レア',
  'super-rare': 'スーパーレア',
};

/** The king's frame: gold, whatever the settings' colour. */
export const CROWN_FRAME = '#e8c66a';

export interface QuestCardOwner {
  /** The frame's colour: the member's colour, gold for the king. */
  readonly frame: string;
  readonly crown: boolean;
  /** Who is in charge: the picture in the window (Issue #269). */
  readonly id: MemberId;
}

export interface QuestCardPr {
  readonly number: number;
  readonly files: number;
  readonly wait: string;
}

export interface QuestCard {
  readonly number: number;
  readonly title: string;
  /** e.g. 「〆10/24 あと 3 日」; null without 〆M/D. */
  readonly deadline: string | null;
  /** e.g. 「@10/22 あと 1 日」; null without @M/D. */
  readonly doDay: string | null;
  readonly owner: QuestCardOwner;
  /** Null when the opening time is not known (a king's Issue of an older collector). */
  readonly rarity: Rarity | null;
  /** Open PRs linking the quest, by number. */
  readonly prs: readonly QuestCardPr[];
}

type CardSnapshot = Pick<Snapshot, 'fetchedAt' | 'issues' | 'prs' | 'president'>;

/** Days open → rarity. */
export function rarityOf(daysOpen: number): Rarity {
  if (daysOpen >= RARITY_DAYS.superRare) return 'super-rare';
  return daysOpen >= RARITY_DAYS.rare ? 'rare' : 'normal';
}

/** 「〆10/24 あと 3 日」, 「〆10/21 きょう」 or 「〆10/20 1 日 すぎた」. */
export function markText(mark: '〆' | '@', days: number | null, nowMs: number): string | null {
  if (days === null) return null;
  const date = `${mark}${monthDayAfter(nowMs, days)}`;
  if (days === 0) return `${date} きょう`;
  return days > 0 ? `${date} あと ${String(days)} 日` : `${date} ${String(-days)} 日 すぎた`;
}

function ownerOf(member: MemberConfig, crown = false): QuestCardOwner {
  return {
    frame: crown ? CROWN_FRAME : member.color,
    crown,
    id: member.id,
  };
}

/** Who is in charge of a board section. */
export function ownerOfGroup(key: BoardGroup['key']): QuestCardOwner {
  if (key === 'king') return ownerOf(MEMBERS.yukihiro, true);
  if (key === 'reception') return ownerOf(MEMBERS.kaname);
  const department = key.slice('department:'.length);
  return ownerOf(MEMBERS[departmentMember(department)]);
}

const WAIT_LABELS: Readonly<Record<PrWaitKind, string>> = {
  president: `${MEMBERS.yukihiro.role}待ち`,
  kaname: `${MEMBERS.kaname.name}待ち`,
};

/** Open PRs that link `number`, the smallest number first. */
export function prsOf(prs: CardSnapshot['prs'], number: number): QuestCardPr[] {
  return prs
    .filter((pr) => pr.state === 'open' && pr.linkedIssues.includes(number))
    .toSorted((a, b) => a.number - b.number)
    .map((pr) => ({
      number: pr.number,
      files: pr.changedFiles.length,
      wait: WAIT_LABELS[prWaitKind(pr) ?? 'kaname'],
    }));
}

function createdAtOf(snapshot: CardSnapshot, number: number): string | undefined {
  const issue = snapshot.issues.find((item) => item.number === number);
  return issue?.createdAt ?? snapshot.president?.issues.find((i) => i.number === number)?.createdAt;
}

/** The card of quest `number`; null when no section of `groups` lists it (closed, or gone). */
export function buildQuestCard(
  groups: readonly BoardGroup[],
  snapshot: CardSnapshot,
  number: number,
): QuestCard | null {
  for (const group of groups) {
    const quest = group.quests.find((item) => item.number === number);
    if (quest === undefined) continue;
    const nowMs = Date.parse(snapshot.fetchedAt);
    const deadline = daysToDeadline(quest.title, nowMs);
    const createdAt = createdAtOf(snapshot, number);
    return {
      number,
      title: quest.title,
      deadline: markText('〆', deadline, nowMs),
      doDay: markText('@', daysToDoDay(quest.title, nowMs), nowMs),
      owner: ownerOfGroup(group.key),
      rarity: createdAt === undefined ? null : rarityOf((nowMs - Date.parse(createdAt)) / DAY_MS),
      prs: prsOf(snapshot.prs, number),
    };
  }
  return null;
}
