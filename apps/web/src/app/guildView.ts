import type { Snapshot } from '@conect-guild/snapshot';
import type { SnapshotLoadFailure } from '../adapters/snapshot';
import {
  DEPARTMENT_LABELS,
  departmentMember,
  MEMBERS,
  type MemberConfig,
  type MemberId,
} from '../guild.config';
import type { GuildEvent } from '../domain/events';
import { faceColors, type FaceColors } from '../domain/faceColor';
import { isSnapshotStale } from '../domain/freshness';
import type { GuestItem, GuestView } from '../domain/guests';
import {
  assignPr,
  deriveMemberStatuses,
  indexIssues,
  prWaitKind,
  type MemberState,
} from '../domain/party';
import { toQuests, type Quest } from '../domain/quest';
import { countRecentRewards } from '../domain/reward';
import { liveStatesOf, NO_LIVE_STATES, type LiveState } from '../domain/session';
import type { GuildMessage } from './messageQueue';
import { buildPartyLevels, type PartyLevel } from './partyLevel';

/**
 * Pure builders that turn a snapshot into what the windows show. The windows only render these;
 * every decision (who, which state, which label) is made here or in domain/.
 */

type SnapshotLists = Pick<Snapshot, 'issues' | 'prs'>;

export interface BoardGroup {
  /**
   * Unique key: 'reception', or `department:` + the label (a label may itself be "reception").
   */
  readonly key: 'reception' | `department:${string}`;
  readonly label: string;
  readonly color: string;
  readonly quests: readonly Quest[];
}

export const STATE_LABELS: Readonly<Record<MemberState, string>> = {
  'awaiting-permission': '許可待ち',
  'awaiting-president': `${MEMBERS.yukihiro.role}の承認まち`,
  'awaiting-kaname': `${MEMBERS.kaname.name}の確認まち`,
  busy: 'いま作業中',
  working: '作業中',
  done: '完了',
  idle: '待機中',
};

/** Open quests grouped as the board shows them: かなめの受付 first, then each department. */
export function buildBoard(snapshot: SnapshotLists): BoardGroup[] {
  const open = toQuests(snapshot.issues).filter((quest) => quest.state === 'open');
  const reception: BoardGroup = {
    key: 'reception',
    label: `${MEMBERS.kaname.name}の受付`,
    color: MEMBERS.kaname.color,
    quests: open.filter((quest) => quest.department === null),
  };
  const departments = DEPARTMENT_LABELS.map((department): BoardGroup => {
    const member = MEMBERS[departmentMember(department)];
    return {
      key: `department:${department}`,
      label: `${member.name}（${department}）`,
      color: member.color,
      quests: open.filter((quest) => quest.department === department),
    };
  });
  return [reception, ...departments].filter((group) => group.quests.length > 0);
}

/** How many open items of each guest the board lists (the most recently updated). */
export const GUEST_BOARD_ITEMS = 3;

/** A guest's part of the board's お客さん section (Issue #108). */
export interface GuestBoardGroup {
  readonly key: `guest:${string}`;
  readonly name: string;
  /** Null while the guest has no repository or it has not been fetched: nothing to list. */
  readonly items: readonly GuestItem[] | null;
  /** Open items not listed (「ほか n 件」). */
  readonly more: number;
}

/** The お客さん section: one group per guest, in the settings' order; empty without guests. */
export function buildGuestBoard(guests: readonly GuestView[]): GuestBoardGroup[] {
  return guests.map((guest) => {
    const open = guest.repo?.open ?? null;
    return {
      key: `guest:${String(guest.index)}`,
      name: guest.name,
      items: open?.slice(0, GUEST_BOARD_ITEMS) ?? null,
      more: Math.max((open?.length ?? 0) - GUEST_BOARD_ITEMS, 0),
    };
  });
}

/** CSS-facing state of a row. Department members use MemberState; かなめ and the king reuse it. */
export interface PartyRow {
  readonly id: MemberId;
  readonly name: string;
  readonly role: string;
  /** The face icon: filled with the member's hair colour (Issue #120). */
  readonly face: FaceColors;
  readonly state: MemberState;
  readonly stateLabel: string;
  /** Tooltip text (title attribute); null when there is nothing to explain. */
  readonly tooltip: string | null;
  /** 最近の成果 (PRs merged in the last 7 days); null for かなめ and the king. */
  readonly rewards: number | null;
  /** The cumulative level (Issue #19); the king has none and shows おうさま. */
  readonly level: PartyLevel;
}

/** A row before its level is attached (buildParty adds it). */
type PartyRowBase = Omit<PartyRow, 'level'>;

export interface WaitCounts {
  /** Open PRs that change rules and wait for the president's merge. */
  readonly president: number;
  /** Open PRs that wait for かなめ's review. */
  readonly kaname: number;
  /** Open Issues and open PRs with no department, waiting at the reception. */
  readonly reception: number;
}

export function countWaits(snapshot: SnapshotLists): WaitCounts {
  const index = indexIssues(snapshot.issues);
  const waits = snapshot.prs.map(prWaitKind);
  const openQuests = toQuests(snapshot.issues).filter((quest) => quest.state === 'open');
  const unassignedPrs = snapshot.prs.filter(
    (pr) => pr.state === 'open' && assignPr(pr, index).department === null,
  );
  return {
    president: waits.filter((wait) => wait === 'president').length,
    kaname: waits.filter((wait) => wait === 'kaname').length,
    reception:
      openQuests.filter((quest) => quest.department === null).length + unassignedPrs.length,
  };
}

function row(
  member: MemberConfig,
  view: Pick<PartyRow, 'state' | 'stateLabel' | 'tooltip' | 'rewards'>,
): PartyRowBase {
  return {
    id: member.id,
    name: member.name,
    role: member.role,
    face: faceColors(member.id),
    ...view,
  };
}

/** Tooltips of the live states: they come from the session, not from GitHub. */
export const LIVE_TOOLTIPS: Readonly<Record<LiveState, string>> = {
  'awaiting-permission': 'セッションがツールを使う許可を待っています（MulmoTerminal より）',
  working: 'セッションがいま動いています（MulmoTerminal より）',
};

function kanameRow(waits: WaitCounts, live: LiveState | undefined): PartyRowBase {
  const tooltip = `確認まちの PR ${String(waits.kaname)} 件・受付の巻物 ${String(waits.reception)} 件`;
  if (live === 'awaiting-permission') {
    return row(MEMBERS.kaname, {
      state: 'awaiting-permission',
      stateLabel: STATE_LABELS['awaiting-permission'],
      tooltip: `${LIVE_TOOLTIPS[live]}。${tooltip}`,
      rewards: null,
    });
  }
  if (waits.kaname > 0) {
    return row(MEMBERS.kaname, {
      state: 'awaiting-kaname',
      stateLabel: `PR の確認 ${String(waits.kaname)} 件`,
      tooltip,
      rewards: null,
    });
  }
  if (live === 'working') {
    return row(MEMBERS.kaname, {
      state: 'busy',
      stateLabel: STATE_LABELS.busy,
      tooltip: `${LIVE_TOOLTIPS[live]}。${tooltip}`,
      rewards: null,
    });
  }
  if (waits.reception > 0) {
    return row(MEMBERS.kaname, {
      state: 'working',
      stateLabel: `受付 ${String(waits.reception)} 件`,
      tooltip,
      rewards: null,
    });
  }
  return row(MEMBERS.kaname, { state: 'idle', stateLabel: '受付で待機', tooltip, rewards: null });
}

function kingRow(waits: WaitCounts): PartyRowBase {
  if (waits.president > 0) {
    return row(MEMBERS.yukihiro, {
      state: 'awaiting-president',
      stateLabel: `承認まち ${String(waits.president)} 件`,
      tooltip: `ルールを変える PR は${MEMBERS.yukihiro.role}がマージします`,
      rewards: null,
    });
  }
  return row(MEMBERS.yukihiro, {
    state: 'idle',
    stateLabel: '玉座で待機',
    tooltip: '承認まちの PR はありません',
    rewards: null,
  });
}

function memberTooltip(state: MemberState, reason: string | null): string | null {
  if (state === 'awaiting-permission') return LIVE_TOOLTIPS['awaiting-permission'];
  if (state === 'busy') return LIVE_TOOLTIPS.working;
  return reason;
}

/**
 * One row each: かなめ, the departments (fixed order), then the king. The live session states
 * join in while they are fresh (docs/DESIGN.md 4.7); the levels come from the history (4.6).
 * `now` is epoch ms.
 */
export function buildParty(
  snapshot: Pick<Snapshot, 'issues' | 'prs' | 'sessions' | 'history'>,
  now: number,
): PartyRow[] {
  const waits = countWaits(snapshot);
  const rewards = countRecentRewards(snapshot, now);
  const live = liveStatesOf(snapshot.sessions, now) ?? NO_LIVE_STATES;
  const members = deriveMemberStatuses(snapshot, now, undefined, live).map((status) =>
    row(MEMBERS[status.memberId], {
      state: status.state,
      stateLabel: STATE_LABELS[status.state],
      tooltip: memberTooltip(status.state, status.reason),
      rewards: rewards[status.department] ?? 0,
    }),
  );
  const levels = buildPartyLevels(snapshot);
  return [kanameRow(waits, live.kaname), ...members, kingRow(waits)].map((base) => ({
    ...base,
    level: levels[base.id],
  }));
}

export interface KingBubbleView {
  /** True while a rule-changing PR waits for the president's merge. */
  readonly waiting: boolean;
  /** Tooltip text; null before the first snapshot. */
  readonly detail: string | null;
}

/** The bubble over the throne. Before the first snapshot nothing is waiting. */
export function buildKingBubble(snapshot: SnapshotLists | null): KingBubbleView {
  if (snapshot === null) return { waiting: false, detail: null };
  const president = countWaits(snapshot).president;
  return {
    waiting: president > 0,
    detail: president > 0 ? `承認まち ${String(president)} 件` : '承認まちの PR はありません',
  };
}

/** A scene to start on the canvas: the event of the message now in the window. */
export interface SceneCue {
  /** The message id, so the same message never starts its scene twice. */
  readonly id: number;
  readonly event: GuildEvent;
}

/** The cue for the head message; null when it reports no event (a notice) or there is none. */
export function sceneCue(message: GuildMessage | null): SceneCue | null {
  const event = message?.event ?? null;
  return message === null || event === null ? null : { id: message.id, event };
}

/** A guest to sparkle on the canvas: the guest of the message now in the window (Issue #108). */
export interface GuestCue {
  /** The message id, so the same message never sparkles twice. */
  readonly id: number;
  readonly guest: number;
}

/** The guest cue of the head message; null when it reports no guest's PR or Issue. */
export function guestCue(message: GuildMessage | null): GuestCue | null {
  const guest = message?.guest;
  return message === null || guest === undefined ? null : { id: message.id, guest };
}

/**
 * Which guest to sparkle now, once per message: the cue of the message in the window, when the
 * stage runs (`ready`). A cue seen while the stage loads waits for it, as long as its message is
 * still in the window; `lastId` is the message last sparkled for.
 */
export function guestCueToPlay(
  lastId: number | null,
  cue: GuestCue | null,
  ready: boolean,
): { readonly lastId: number | null; readonly play: number | null } {
  if (!ready || cue === null || cue.id === lastId) return { lastId, play: null };
  return { lastId: cue.id, play: cue.guest };
}

/**
 * The message last sparkled for, once the screen halts or comes back: a halt forgets it, so the
 * guest line still in the window sparkles again when the window shows again (its sparkle was
 * dropped with the halt).
 */
export function guestSparkleAfterHalt(lastId: number | null, halted: boolean): number | null {
  return halted ? null : lastId;
}

/** Cues the canvas has seen: the last one, and those waiting for its loop to start. */
export interface CueQueue {
  readonly lastId: number | null;
  readonly waiting: readonly SceneCue[];
}

export const EMPTY_CUE_QUEUE: CueQueue = { lastId: null, waiting: [] };

/**
 * Queues a cue that reached the window, once per message. The canvas plays the queue as soon as
 * its loop runs, so cues that arrive while the pictures load are played in order, not lost.
 */
export function receiveCue(queue: CueQueue, cue: SceneCue | null): CueQueue {
  if (cue === null || cue.id === queue.lastId) return queue;
  return { lastId: cue.id, waiting: [...queue.waiting, cue] };
}

/** The queued cues to play now (oldest first), and the queue without them. */
export function takeCues(queue: CueQueue): { queue: CueQueue; play: readonly SceneCue[] } {
  return { queue: { ...queue, waiting: [] }, play: queue.waiting };
}

const FAILURE_LABELS: Readonly<Record<SnapshotLoadFailure, string>> = {
  network: 'つながりません',
  timeout: '時間切れ',
  'not-collected': 'データのファイルがありません',
  http: 'サーバーがエラーを返しました',
  parse: 'データが壊れています',
  invalid: 'データの形が違います',
  'schema-version': '収集スクリプトを更新してください',
  'repo-mismatch': '収集の対象と設定が違います',
};

export interface FetchStatusView {
  /**
   * e.g. `取得失敗（つながりません）`; null after a successful fetch, and while `notCollected`
   * (the screen shows a guide instead of an error).
   */
  readonly failure: string | null;
  /**
   * True before any snapshot while the file is not there yet: the collector has never run
   * (Issue #67). The file gone after a snapshot was shown is an ordinary failure.
   */
  readonly notCollected: boolean;
  /** True when the shown snapshot is older than the stale limit (the collector may be down). */
  readonly stale: boolean;
  /** `HH:MM` (local time) of the shown snapshot's fetchedAt; null before the first success. */
  readonly fetchedAt: string | null;
  /** Why the live session states are not shown; null while they are (or before any snapshot). */
  readonly sessions: string | null;
}

function sessionsNotice(snapshot: Pick<Snapshot, 'sessions'>, now: number): string | null {
  if (snapshot.sessions.status === 'unavailable') return 'セッションの状態を読めません';
  return liveStatesOf(snapshot.sessions, now) === null ? 'セッションの状態が古いままです' : null;
}

/** `HH:MM` in the runtime's local time zone. */
export function formatClock(epochMs: number): string {
  const date = new Date(epochMs);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function buildFetchStatus(
  snapshot: Pick<Snapshot, 'fetchedAt' | 'sessions'> | null,
  failure: SnapshotLoadFailure | null,
  now: number,
): FetchStatusView {
  const notCollected = snapshot === null && failure === 'not-collected';
  return {
    failure: failure === null || notCollected ? null : `取得失敗（${FAILURE_LABELS[failure]}）`,
    notCollected,
    stale: snapshot !== null && isSnapshotStale(snapshot.fetchedAt, now),
    fetchedAt: snapshot === null ? null : formatClock(Date.parse(snapshot.fetchedAt)),
    sessions: snapshot === null ? null : sessionsNotice(snapshot, now),
  };
}
