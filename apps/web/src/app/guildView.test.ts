import type { Snapshot, SnapshotSession } from '@conect-guild/snapshot';
import { describe, expect, it } from 'vitest';
import {
  at,
  closedIssue,
  issue,
  mergedPr,
  minutesAfter,
  pr,
  snapshot,
  T0,
} from '../domain/fixtures.test-util';
import {
  buildBoard,
  buildFetchStatus,
  buildKingBubble,
  buildParty,
  countWaits,
  EMPTY_CUE_QUEUE,
  formatClock,
  LIVE_TOOLTIPS,
  receiveCue,
  sceneCue,
  STATE_LABELS,
  takeCues,
} from './guildView';

describe('buildBoard', () => {
  it('groups open quests: reception first, then departments in the fixed order', () => {
    const snap = snapshot({
      issues: [
        issue(3, { labels: ['総務'] }),
        issue(1, { labels: ['経理'] }),
        issue(2),
        issue(4, { labels: ['企画', '広報'] }),
      ],
    });
    const board = buildBoard(snap);
    expect(board.map((g) => g.key)).toEqual([
      'reception',
      'department:経理',
      'department:広報',
      'department:総務',
    ]);
    expect(board.map((g) => g.label)).toEqual([
      'かなめの受付',
      'みのり（経理）',
      'ひびき（広報）',
      'ささえ（総務）',
    ]);
    const multi = board.find((g) => g.key === 'department:広報')?.quests[0];
    expect(multi).toMatchObject({ number: 4, multiDepartment: true });
  });

  it('leaves closed quests off the board', () => {
    const board = buildBoard(snapshot({ issues: [closedIssue(1, T0, ['経理'])] }));
    expect(board).toEqual([]);
  });

  it('returns no groups for an empty snapshot', () => {
    expect(buildBoard(snapshot())).toEqual([]);
  });
});

describe('countWaits', () => {
  it('counts president waits, kaname waits and the reception separately', () => {
    const snap = snapshot({
      issues: [issue(1, { labels: ['経理'] }), issue(2)],
      prs: [
        pr(10, { linkedIssues: [1], changedFiles: ['accounting/CLAUDE.md'] }),
        pr(11, { linkedIssues: [1], changedFiles: ['a.md'] }),
        pr(12, { headRef: 'misc/x' }),
        mergedPr(13, T0),
      ],
    });
    // reception: Issue #2 (no label) + PR #12 (no department).
    expect(countWaits(snap)).toEqual({ president: 1, kaname: 2, reception: 2 });
  });

  it('is all zero for an empty snapshot', () => {
    expect(countWaits(snapshot())).toEqual({ president: 0, kaname: 0, reception: 0 });
  });
});

describe('buildParty', () => {
  const now = at(minutesAfter(T0, 10));

  it('lists six members: かなめ, the four departments, then the king', () => {
    const rows = buildParty(snapshot(), now);
    expect(rows.map((r) => r.name)).toEqual([
      'かなめ',
      'みのり',
      'ひびき',
      'ひらめ',
      'ささえ',
      'ゆきひろ',
    ]);
  });

  it('labels each department state in Japanese, with recent rewards', () => {
    const snap = snapshot({
      issues: [
        issue(1, { labels: ['経理'] }),
        issue(2, { labels: ['広報'] }),
        issue(3, { labels: ['企画'] }),
        closedIssue(4, T0, ['総務']),
      ],
      prs: [
        pr(10, { linkedIssues: [1], changedFiles: ['CLAUDE.md'] }),
        pr(11, { linkedIssues: [2] }),
        mergedPr(12, T0, { linkedIssues: [4] }),
      ],
    });
    const rows = buildParty(snap, now);
    expect(rows.slice(1, 5).map((r) => [r.stateLabel, r.rewards])).toEqual([
      ['社長の承認まち', 0],
      ['かなめの確認まち', 0],
      ['作業中', 0],
      ['完了', 1],
    ]);
  });

  it('explains idle in the tooltip and leaves busy states without one', () => {
    const rows = buildParty(snapshot({ issues: [issue(1, { labels: ['経理'] })] }), now);
    expect(rows[1]?.tooltip).toBeNull();
    expect(rows[2]?.state).toBe('idle');
    expect(rows[2]?.tooltip).toContain('担当の Issue・PR がありません');
  });
});

describe('buildParty: かなめ and the king', () => {
  const now = at(minutesAfter(T0, 10));

  it('puts the king on 承認まち when a rule-changing PR is open', () => {
    const rows = buildParty(snapshot({ prs: [pr(10, { changedFiles: ['CLAUDE.md'] })] }), now);
    expect(rows[5]).toMatchObject({ state: 'awaiting-president', stateLabel: '承認まち 1 件' });
  });

  it('keeps the king idle without rule-changing PRs', () => {
    const rows = buildParty(snapshot({ prs: [pr(10, { changedFiles: ['a.md'] })] }), now);
    expect(rows[5]).toMatchObject({ state: 'idle', stateLabel: '玉座で待機', rewards: null });
  });

  it('shows かなめ reviewing PRs before reception work, and idle with nothing', () => {
    const reviewing = buildParty(snapshot({ issues: [issue(2)], prs: [pr(10)] }), now)[0];
    expect(reviewing).toMatchObject({ state: 'awaiting-kaname', stateLabel: 'PR の確認 1 件' });
    const reception = buildParty(snapshot({ issues: [issue(2)] }), now)[0];
    expect(reception).toMatchObject({ state: 'working', stateLabel: '受付 1 件' });
    const idle = buildParty(snapshot(), now)[0];
    expect(idle).toMatchObject({ state: 'idle', stateLabel: '受付で待機', rewards: null });
  });

  it('has a Japanese label for every state', () => {
    expect(Object.values(STATE_LABELS)).toEqual([
      '許可待ち',
      '社長の承認まち',
      'かなめの確認まち',
      'いま作業中',
      '作業中',
      '完了',
      '待機中',
    ]);
  });
});

describe('buildParty: live sessions', () => {
  const now = at(T0);
  const live = (members: SnapshotSession[], checkedAt = T0): Snapshot['sessions'] => ({
    status: 'ok',
    guests: [],
    checkedAt,
    members,
  });

  it('shows 許可待ち and いま作業中 with their tooltips', () => {
    const snap = snapshot({
      issues: [issue(1, { labels: ['広報'] })],
      sessions: live([
        { department: '経理', state: 'awaiting-permission' },
        { department: '広報', state: 'working' },
        { department: '企画', state: 'resting' },
        { department: '総務', state: 'idle' },
      ]),
    });
    const rows = buildParty(snap, now);
    expect(rows.slice(1, 5).map((r) => [r.state, r.stateLabel])).toEqual([
      ['awaiting-permission', '許可待ち'],
      ['busy', 'いま作業中'],
      ['idle', '待機中'],
      ['idle', '待機中'],
    ]);
    expect(rows[1]?.tooltip).toBe(LIVE_TOOLTIPS['awaiting-permission']);
    expect(rows[2]?.tooltip).toBe(LIVE_TOOLTIPS.working);
  });

  it('ranks かなめ: 許可待ち > PR の確認 > いま作業中 > 受付', () => {
    const reviewing = { issues: [issue(2)], prs: [pr(10)] };
    const asking = live([{ department: null, state: 'awaiting-permission' }]);
    const working = live([{ department: null, state: 'working' }]);
    expect(buildParty(snapshot({ ...reviewing, sessions: asking }), now)[0]).toMatchObject({
      state: 'awaiting-permission',
      stateLabel: '許可待ち',
    });
    expect(buildParty(snapshot({ ...reviewing, sessions: working }), now)[0]).toMatchObject({
      state: 'awaiting-kaname',
    });
    const reception = buildParty(snapshot({ issues: [issue(2)], sessions: working }), now)[0];
    expect(reception).toMatchObject({ state: 'busy', stateLabel: 'いま作業中' });
    expect(reception?.tooltip).toContain(LIVE_TOOLTIPS.working);
  });

  it('falls back to GitHub when the sessions are unavailable or stale', () => {
    const issues = [issue(1, { labels: ['経理'] })];
    const busy = [{ department: '経理', state: 'working' } as const];
    const stale = live(busy, minutesAfter(T0, -1));
    expect(buildParty(snapshot({ issues, sessions: stale }), now)[1]?.state).toBe('working');
    const fresh = live(busy, T0);
    expect(buildParty(snapshot({ issues, sessions: fresh }), now)[1]?.state).toBe('busy');
    expect(buildParty(snapshot({ issues }), now)[1]?.state).toBe('working');
  });

  it('never changes the king', () => {
    const rows = buildParty(
      snapshot({ sessions: live([{ department: null, state: 'working' }]) }),
      now,
    );
    expect(rows[5]).toMatchObject({ state: 'idle' });
  });
});

describe('buildFetchStatus', () => {
  const fetchedAt = '2026-10-12T00:00:00Z';
  const sessions: Snapshot['sessions'] = {
    status: 'ok',
    checkedAt: fetchedAt,
    members: [],
    guests: [],
  };

  it('shows nothing before the first success', () => {
    expect(buildFetchStatus(null, null, at(fetchedAt))).toEqual({
      failure: null,
      notCollected: false,
      stale: false,
      fetchedAt: null,
      sessions: null,
    });
  });

  it('notes when the sessions are unavailable or stale, judged apart from fetchedAt', () => {
    expect(buildFetchStatus({ fetchedAt, sessions }, null, at(fetchedAt)).sessions).toBeNull();
    const unavailable = { status: 'unavailable', checkedAt: fetchedAt } as const;
    expect(
      buildFetchStatus({ fetchedAt, sessions: unavailable }, null, at(fetchedAt)).sessions,
    ).toBe('セッションの状態を読めません');
    const later = at(fetchedAt) + 31_000;
    const view = buildFetchStatus({ fetchedAt, sessions }, null, later);
    expect(view.sessions).toBe('セッションの状態が古いままです');
    expect(view.stale).toBe(false);
  });

  it('labels a failure while keeping the previous snapshot time', () => {
    const view = buildFetchStatus({ fetchedAt, sessions }, 'network', at(fetchedAt));
    expect(view.failure).toBe('取得失敗（つながりません）');
    expect(view.fetchedAt).toBe(formatClock(at(fetchedAt)));
  });

  it('marks the snapshot stale only past five minutes', () => {
    expect(
      buildFetchStatus({ fetchedAt, sessions }, null, at(minutesAfter(fetchedAt, 5))).stale,
    ).toBe(false);
    expect(
      buildFetchStatus({ fetchedAt, sessions }, null, at(minutesAfter(fetchedAt, 6))).stale,
    ).toBe(true);
  });

  it('labels every failure reason', () => {
    const reasons = [
      'network',
      'timeout',
      'http',
      'parse',
      'invalid',
      'schema-version',
      'repo-mismatch',
    ] as const;
    for (const reason of reasons) {
      expect(buildFetchStatus(null, reason, 0).failure).toMatch(/^取得失敗（.+）$/);
    }
  });
});

describe('buildFetchStatus: not collected yet (Issue #67)', () => {
  const fetchedAt = '2026-10-12T00:00:00Z';
  const sessions: Snapshot['sessions'] = {
    status: 'ok',
    checkedAt: fetchedAt,
    members: [],
    guests: [],
  };

  it('guides instead of failing while nothing was collected yet (Issue #67)', () => {
    expect(buildFetchStatus(null, 'not-collected', at(fetchedAt))).toEqual({
      failure: null,
      notCollected: true,
      stale: false,
      fetchedAt: null,
      sessions: null,
    });
  });

  it('treats nothing collected (204) after a shown snapshot as an ordinary failure, never stale', () => {
    const later = at(minutesAfter(fetchedAt, 1));
    const view = buildFetchStatus({ fetchedAt, sessions }, 'not-collected', later);
    expect(view.notCollected).toBe(false);
    expect(view.failure).toBe('取得失敗（データのファイルがありません）');
  });

  it('is not a guide for any other failure before the first snapshot', () => {
    for (const reason of ['network', 'http', 'invalid'] as const)
      expect(buildFetchStatus(null, reason, 0).notCollected).toBe(false);
  });
});

describe('formatClock', () => {
  it('pads hours and minutes in local time', () => {
    expect(formatClock(new Date(2026, 9, 12, 7, 5).getTime())).toBe('07:05');
    expect(formatClock(new Date(2026, 9, 12, 23, 59).getTime())).toBe('23:59');
  });
});

describe('buildKingBubble', () => {
  it('waits while a rule-changing PR is open', () => {
    const snap = snapshot({ prs: [pr(10, { changedFiles: ['CLAUDE.md'] }), pr(11)] });
    expect(buildKingBubble(snap)).toEqual({ waiting: true, detail: '承認まち 1 件' });
  });

  it('does not wait for PRs that only need かなめ, or for merged rule changes', () => {
    const snap = snapshot({
      prs: [pr(11), mergedPr(12, T0, { changedFiles: ['CLAUDE.md'] })],
    });
    expect(buildKingBubble(snap)).toEqual({ waiting: false, detail: '承認まちの PR はありません' });
  });

  it('does not wait before the first snapshot', () => {
    expect(buildKingBubble(null)).toEqual({ waiting: false, detail: null });
  });
});

describe('sceneCue', () => {
  const closed = {
    id: 'issue-closed#98',
    kind: 'issue-closed',
    number: 98,
    department: '総務',
  } as const;

  it('cues the event of the message in the window, keyed by the message id', () => {
    expect(sceneCue({ id: 7, text: 'クリアした！', event: closed })).toEqual({
      id: 7,
      event: closed,
    });
  });

  it('cues nothing for a notice or an empty window', () => {
    expect(sceneCue({ id: 8, text: 'この期間の出来事は復元できません', event: null })).toBeNull();
    expect(sceneCue(null)).toBeNull();
  });
});

describe('receiveCue / takeCues', () => {
  const event = {
    id: 'pr-merged#5',
    kind: 'pr-merged',
    number: 5,
    department: '経理',
  } as const;
  const first = { id: 3, event };
  const second = { id: 4, event: { ...event, id: 'pr-merged#6', number: 6 } };

  it('plays a cue that arrived before the loop ran', () => {
    const { play } = takeCues(receiveCue(EMPTY_CUE_QUEUE, first));
    expect(play).toEqual([first]);
  });

  it('keeps every cue that arrived while the pictures loaded, in order', () => {
    const queue = receiveCue(receiveCue(EMPTY_CUE_QUEUE, first), second);
    expect(takeCues(queue).play).toEqual([first, second]);
  });

  it('does not queue the same message twice', () => {
    const once = receiveCue(EMPTY_CUE_QUEUE, first);
    expect(receiveCue(once, first)).toBe(once);
    const played = takeCues(once).queue;
    expect(takeCues(receiveCue(played, first)).play).toEqual([]);
  });

  it('queues nothing without a cue, and empties the queue once taken', () => {
    expect(receiveCue(EMPTY_CUE_QUEUE, null)).toBe(EMPTY_CUE_QUEUE);
    const { queue } = takeCues(receiveCue(EMPTY_CUE_QUEUE, first));
    expect(queue).toEqual({ lastId: 3, waiting: [] });
    expect(takeCues(queue).play).toEqual([]);
  });

  it('queues a message again after another one (a new message id)', () => {
    const queue = takeCues(receiveCue(EMPTY_CUE_QUEUE, first)).queue;
    expect(takeCues(receiveCue(queue, second)).play).toEqual([second]);
  });
});
