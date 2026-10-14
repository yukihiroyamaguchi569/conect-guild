import type { GuestGithubPart, GuestRecentItem, SessionState } from '@conect-guild/snapshot';
import { FICTIONAL_GUESTS, makeSettings } from '@conect-guild/snapshot/settings.fixtures';
import { describe, expect, it } from 'vitest';
import { SESSION_STALE_AFTER_MS } from '../guild.config';
import { at, minutesAfter, snapshot, T0 } from './fixtures.test-util';
import { buildGuests, guestEventMessage, guestEvents, type GuestBaseline } from './guests';

const GUESTS = makeSettings(4, { guests: [...FICTIONAL_GUESTS] }).guests ?? [];
const REPO = 'example-visitor/visitor-app';

function part(over: Partial<GuestGithubPart> = {}): GuestGithubPart {
  return { repo: REPO, fetchedAt: T0, open: [], recent: [], ...over };
}

function open(number: number, isPr: boolean, updatedMinutes: number) {
  return {
    number,
    title: `架空の題名 ${String(number)}`,
    isPr,
    createdAt: T0,
    updatedAt: minutesAfter(T0, updatedMinutes),
  };
}

function recent(kind: GuestRecentItem['kind'], number: number): GuestRecentItem {
  return { kind, number, title: `架空の完了 ${String(number)}`, at: T0 };
}

/** Read sessions; the members are not read for the guests. */
function okSessions(guests: SessionState[]) {
  return { status: 'ok', checkedAt: T0, members: [], guests } as const;
}

describe('buildGuests', () => {
  it('is empty without guests in the settings, whatever the snapshot has', () => {
    const shot = snapshot({ guests: [part()], sessions: okSessions(['working']) });
    expect(buildGuests([], shot, at(T0))).toEqual([]);
  });

  it('names each guest from the settings and takes its state and repository by position', () => {
    const shot = snapshot({
      guests: [part({ open: [open(1, false, 1), open(2, true, 5), open(3, false, 3)] }), null],
      sessions: okSessions(['working', 'awaiting-permission']),
    });
    const views = buildGuests(GUESTS, shot, at(T0));
    expect(views).toEqual([
      {
        index: 0,
        name: 'たびびと',
        state: 'working',
        repo: {
          openIssues: 2,
          openPrs: 1,
          // The most recently updated first.
          open: [
            { number: 2, title: '架空の題名 2', isPr: true },
            { number: 3, title: '架空の題名 3', isPr: false },
            { number: 1, title: '架空の題名 1', isPr: false },
          ],
        },
      },
      { index: 1, name: 'ぼうけんしゃ', state: 'awaiting-permission', repo: null },
    ]);
  });

  it('counts an empty repository as zero, not as unknown', () => {
    const views = buildGuests(GUESTS.slice(0, 1), snapshot({ guests: [part()] }), at(T0));
    expect(views[0]?.repo).toEqual({ openIssues: 0, openPrs: 0, open: [] });
  });

  it('leaves the guests idle while the sessions cannot be read', () => {
    const shot = snapshot({ guests: [part(), null] });
    expect(buildGuests(GUESTS, shot, at(T0)).map((view) => view.state)).toEqual(['idle', 'idle']);
  });

  it('leaves the guests idle once the sessions are stale, and not at the limit itself', () => {
    const shot = snapshot({ guests: [null, null], sessions: okSessions(['working', 'working']) });
    const limit = at(T0) + SESSION_STALE_AFTER_MS;
    expect(buildGuests(GUESTS, shot, limit).map((view) => view.state)).toEqual([
      'working',
      'working',
    ]);
    expect(buildGuests(GUESTS, shot, limit + 1).map((view) => view.state)).toEqual([
      'idle',
      'idle',
    ]);
  });

  it('shows dropped guests (they did not fit the settings) idle and without a repository', () => {
    const shot = snapshot({ guests: [], sessions: okSessions([]) });
    expect(buildGuests(GUESTS, shot, at(T0))).toEqual([
      { index: 0, name: 'たびびと', state: 'idle', repo: null },
      { index: 1, name: 'ぼうけんしゃ', state: 'idle', repo: null },
    ]);
  });
});

const first = [part({ recent: [recent('pr-merged', 12), recent('issue-completed', 5)] }), null];

describe('guestEvents', () => {
  it('takes the first snapshot as the baseline, with no events', () => {
    const { events, baseline } = guestEvents(null, first);
    expect(events).toEqual([]);
    expect(baseline).toHaveLength(2);
  });

  it('reports the finished items that were not there before, oldest first', () => {
    const { baseline } = guestEvents(null, first);
    const next = [
      part({
        recent: [
          recent('issue-completed', 7),
          recent('pr-merged', 13),
          recent('pr-merged', 12),
          recent('issue-completed', 5),
        ],
      }),
      null,
    ];
    expect(guestEvents(baseline, next).events).toEqual([
      { guest: 0, kind: 'pr-merged', number: 13, title: '架空の完了 13' },
      { guest: 0, kind: 'issue-completed', number: 7, title: '架空の完了 7' },
    ]);
  });

  it('tells an Issue and a PR of the same number apart', () => {
    const { baseline } = guestEvents(null, first);
    const next = [part({ recent: [recent('issue-completed', 12), ...(first[0]?.recent ?? [])] })];
    expect(guestEvents(baseline, next).events).toEqual([
      { guest: 0, kind: 'issue-completed', number: 12, title: '架空の完了 12' },
    ]);
  });

  it('reports nothing for the same snapshot twice, nor for items that fell off the list', () => {
    const { baseline } = guestEvents(null, first);
    expect(guestEvents(baseline, first).events).toEqual([]);
    expect(guestEvents(baseline, [part({ recent: [] }), null]).events).toEqual([]);
  });
});

describe('guestEvents of a guest seen anew', () => {
  it('takes a guest fetched for the first time as its baseline, with no events', () => {
    const { baseline } = guestEvents(null, [null, null]);
    const later = guestEvents(baseline, first);
    expect(later.events).toEqual([]);
    const next = [part({ recent: [recent('pr-merged', 14), ...(first[0]?.recent ?? [])] }), null];
    expect(guestEvents(later.baseline, next).events).toHaveLength(1);
  });

  it('starts over when the repository of a guest changes', () => {
    const { baseline } = guestEvents(null, first);
    const moved = [part({ repo: 'example-visitor/other-app', recent: [recent('pr-merged', 99)] })];
    const after = guestEvents(baseline, moved);
    expect(after.events).toEqual([]);
    const next = [
      part({
        repo: 'example-visitor/other-app',
        recent: [recent('pr-merged', 100), recent('pr-merged', 99)],
      }),
    ];
    expect(guestEvents(after.baseline, next).events.map((e) => e.number)).toEqual([100]);
  });

  it('keeps what was seen while the guests are dropped, so they come back without a burst', () => {
    const { baseline } = guestEvents(null, first);
    const dropped = guestEvents(baseline, []);
    expect(dropped.events).toEqual([]);
    expect(dropped.baseline).toEqual(baseline);
    expect(guestEvents(dropped.baseline, first).events).toEqual([]);
  });

  it('numbers the events by the guest they belong to', () => {
    const second = part({ repo: 'example-visitor/second-app' });
    const base: GuestBaseline = guestEvents(null, [part(), second]).baseline;
    const next = [part(), { ...second, recent: [recent('pr-merged', 3)] }];
    expect(guestEvents(base, next).events).toEqual([
      { guest: 1, kind: 'pr-merged', number: 3, title: '架空の完了 3' },
    ]);
  });
});

describe('guestEventMessage', () => {
  it('says whose PR was merged and whose Issue was completed, with the title', () => {
    const merged = { guest: 0, kind: 'pr-merged', number: 12, title: '看板を直す' } as const;
    expect(guestEventMessage(merged, 'たびびと')).toBe(
      'たびびと の PR #12「看板を直す」がマージされた',
    );
    const done = { guest: 1, kind: 'issue-completed', number: 5, title: '地図を描く' } as const;
    expect(guestEventMessage(done, 'ぼうけんしゃ')).toBe(
      'ぼうけんしゃ の Issue #5「地図を描く」が完了した',
    );
  });
});
