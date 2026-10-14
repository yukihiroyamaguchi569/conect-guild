import type { Snapshot } from '@conect-guild/snapshot';
import { byMember, COMMANDER_ID, PRESIDENT_ID } from '@conect-guild/snapshot/settings';
import { departmentMember, type MemberId } from '../guild.config';
import { countXp, levelOf, NO_XP, type XpTally } from '../domain/xp';

/** What the party window (and the canvas) shows of a member's level (docs/DESIGN.md 4.6). */
export interface PartyLevel {
  /** The level, 1 to 99; null for the king, who has none. */
  readonly level: number | null;
  /** `Lv 9`, or おうさま for the king. */
  readonly label: string;
  /** How far to the next level, 0 to 1, for the gauge; null for the king (no gauge). */
  readonly progress: number | null;
  /** Tooltip: the experience and what it is made of. Counts only, never titles. */
  readonly detail: string;
}

export const KING_LEVEL: PartyLevel = {
  level: null,
  label: 'おうさま',
  progress: null,
  detail: 'おうさまに レベルは ない',
};

/** The parts of the experience, e.g. `クリア 3 件・マージ 2 件`. */
type Breakdown = (tally: XpTally) => string;

const departmentBreakdown: Breakdown = (t) =>
  `クリア ${String(t.clears)} 件・マージ ${String(t.merges)} 件`;
const kanameBreakdown: Breakdown = (t) =>
  `受付の巻物 ${String(t.scrolls)} 件・担当なしのクリア ${String(t.clears)} 件`;

function partyLevel(tally: XpTally, breakdown: Breakdown): PartyLevel {
  const { level, xp, toNext, progress } = levelOf(tally.xp);
  const next = toNext === null ? 'レベルは さいこう' : `つぎのレベルまで ${String(toNext)}`;
  return {
    level,
    label: `Lv ${String(level)}`,
    progress,
    detail: `けいけんち ${String(xp)}・${next}（${breakdown(tally)}）`,
  };
}

/** Each member's level from the snapshot's history: かなめ, the four departments and the king. */
export function buildPartyLevels(
  snapshot: Pick<Snapshot, 'issues' | 'history'>,
): Readonly<Record<MemberId, PartyLevel>> {
  const xp = countXp(snapshot);
  // Every member gets a level (one off stage keeps noneYet); each department label has a tally below.
  const noneYet = partyLevel(NO_XP, departmentBreakdown);
  const levels: Record<MemberId, PartyLevel> = byMember((id) => {
    if (id === COMMANDER_ID) return partyLevel(xp.kaname, kanameBreakdown);
    return id === PRESIDENT_ID ? KING_LEVEL : noneYet;
  });
  for (const [department, tally] of xp.departments) {
    levels[departmentMember(department)] = partyLevel(tally, departmentBreakdown);
  }
  return levels;
}
