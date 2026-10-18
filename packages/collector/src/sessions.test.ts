import { describe, expect, it } from 'vitest';
import type { Seat } from './seat.ts';
import {
  latestCompanySessionIds,
  readSeatStates,
  seatStatesOf,
  sessionStateOf,
  settledLines,
  type ActivityEntry,
  type TailMark,
} from './sessions.ts';

const ROOT = '/home/u/conect-management';
const SEATS: readonly Seat[] = [
  { kind: 'company', department: null, cwd: ROOT },
  { kind: 'company', department: '経理', cwd: `${ROOT}/accounting` },
  { kind: 'company', department: '広報', cwd: `${ROOT}/pr` },
  { kind: 'company', department: '企画', cwd: `${ROOT}/planning` },
  { kind: 'company', department: '総務', cwd: `${ROOT}/general-affairs` },
];

/** Session ids of the company seats. */
const KANAME = 'aaaaaaaa-0000-4000-8000-000000000001';
const KANAME_OLD = 'aaaaaaaa-0000-4000-8000-000000000002';
const MINORI = 'aaaaaaaa-0000-4000-8000-000000000003';
/** Ids and paths of sessions outside the company: they must never come out. */
const OTHER = 'bbbbbbbb-0000-4000-8000-00000000000f';
const OTHER_PATH = '/home/u/secret-client-project';

describe('latestCompanySessionIds: one line', () => {
  const SPACED: readonly Seat[] = [
    { kind: 'company', department: null, cwd: '/home/u/my dir/a b' },
  ];

  it('splits at the first space, so the path keeps its spaces', async () => {
    const ids = await latestCompanySessionIds([`${KANAME} /home/u/my dir/a b`], SPACED);
    expect(ids.get('/home/u/my dir/a b')).toBe(KANAME);
  });

  it('trims the line and the path as MulmoTerminal does', async () => {
    const ids = await latestCompanySessionIds([`  ${KANAME}   ${ROOT}  \r`], SEATS);
    expect(ids.get(ROOT)).toBe(KANAME);
  });

  it.each([
    ['an empty line', ''],
    ['a blank line', '   '],
    ['an id only', KANAME],
    ['an id and a blank path', `${KANAME}    `],
    ['a leading space before the path', ` ${ROOT}`],
    ['a non-UUID id', `not-an-id ${ROOT}`],
    ['a truncated id', `${KANAME.slice(0, 20)} ${ROOT}`],
    ['broken bytes', '\u0000\u0001 garbage'],
  ])('ignores %s', async (_label, line) => {
    expect((await latestCompanySessionIds([line], SEATS)).size).toBe(0);
  });

  it('does not let a broken line move a company id away', async () => {
    const ids = await latestCompanySessionIds([`${KANAME} ${ROOT}`, `${KANAME}    `], SEATS);
    expect(ids.get(ROOT)).toBe(KANAME);
  });
});

async function* lines(...items: string[]): AsyncIterable<string> {
  for (const item of items) {
    await Promise.resolve();
    yield item;
  }
}

describe('latestCompanySessionIds', () => {
  it('takes the last line of each company path', async () => {
    const ids = await latestCompanySessionIds(
      lines('', `${KANAME_OLD} ${ROOT}`, `${MINORI} ${ROOT}/accounting`, `${KANAME} ${ROOT}`),
      SEATS,
    );
    expect([...ids]).toEqual([
      [ROOT, KANAME],
      [`${ROOT}/accounting`, MINORI],
    ]);
  });

  it('accepts a plain iterable', async () => {
    const ids = await latestCompanySessionIds([`${KANAME} ${ROOT}`], SEATS);
    expect(ids.get(ROOT)).toBe(KANAME);
  });

  it('matches paths exactly: no prefix, trailing slash, case or child directory', async () => {
    const ids = await latestCompanySessionIds(
      [
        `${OTHER} ${ROOT}/`,
        `${OTHER} ${ROOT}/accounting/sub`,
        `${OTHER} ${ROOT}-old`,
        `${OTHER} /home/u/Conect-Management`,
        `${OTHER} ${ROOT}/.claude/worktrees/x`,
      ],
      SEATS,
    );
    expect(ids.size).toBe(0);
  });

  it('drops a company id whose last line moved it elsewhere, falling back to the earlier one', async () => {
    const ids = await latestCompanySessionIds(
      [`${KANAME_OLD} ${ROOT}`, `${KANAME} ${ROOT}`, `${KANAME} ${OTHER_PATH}`],
      SEATS,
    );
    expect(ids.get(ROOT)).toBe(KANAME_OLD);
  });

  it('moves an id between company paths to the last one', async () => {
    const ids = await latestCompanySessionIds([`${KANAME} ${ROOT}`, `${KANAME} ${ROOT}/pr`], SEATS);
    expect([...ids]).toEqual([[`${ROOT}/pr`, KANAME]]);
  });

  it('skips empty and broken lines without losing the others', async () => {
    const ids = await latestCompanySessionIds(
      ['', 'garbage', KANAME, `${KANAME} ${ROOT}`, '{"half":'],
      SEATS,
    );
    expect(ids.get(ROOT)).toBe(KANAME);
  });

  it('returns nothing of the other lines', async () => {
    const ids = await latestCompanySessionIds(
      [`${OTHER} ${OTHER_PATH}`, `${KANAME} ${ROOT}`, `${OTHER} ${OTHER_PATH}`],
      SEATS,
    );
    const out = JSON.stringify([...ids]);
    expect(out).not.toContain(OTHER);
    expect(out).not.toContain(OTHER_PATH);
  });

  it('returns an empty map for an empty log', async () => {
    expect((await latestCompanySessionIds([], SEATS)).size).toBe(0);
  });
});

/** One read of a log text (in `chunks`), as the collector does it: the ids and this read's tail. */
async function readLog(chunks: readonly string[], previous: TailMark | null) {
  let tail: TailMark | null = null;
  const ids = await latestCompanySessionIds(
    settledLines(chunks, previous, (next) => {
      tail = next;
    }),
    SEATS,
  );
  return { ids, tail };
}

describe('settledLines: the unterminated last line', () => {
  // MulmoTerminal appends `\n<id> <path>`: the last record has no newline after it.
  const before = `\n${KANAME} ${ROOT}`;
  const cutAtRoot = `\n${MINORI} ${ROOT}`;
  const whole = `\n${MINORI} ${ROOT}/accounting`;

  it('does not take a department line cut at the company root for かなめ', async () => {
    const { ids, tail } = await readLog([before, cutAtRoot], null);
    expect([...ids]).toEqual([[ROOT, KANAME]]);
    expect(tail).not.toBeNull();
  });

  it('takes the last line at the next read when it has not moved', async () => {
    const first = await readLog([before + whole], null);
    expect(first.ids.has(`${ROOT}/accounting`)).toBe(false);
    const second = await readLog([before + whole], first.tail);
    expect(second.ids.get(`${ROOT}/accounting`)).toBe(MINORI);
    expect(second.tail).toEqual(first.tail);
  });

  it('waits again when the last line grew since the previous read', async () => {
    const first = await readLog([before + cutAtRoot], null);
    const second = await readLog([before + whole], first.tail);
    expect([...second.ids]).toEqual([[ROOT, KANAME]]);
    const third = await readLog([before + whole], second.tail);
    expect(third.ids.get(`${ROOT}/accounting`)).toBe(MINORI);
  });

  it('does not take a same text that now ends elsewhere', async () => {
    const first = await readLog([`\n${MINORI} ${ROOT}/accounting`], null);
    const moved = await readLog([before + whole], first.tail);
    expect(moved.ids.has(`${ROOT}/accounting`)).toBe(false);
  });

  it('takes every line as before when the text ends with a newline', async () => {
    const { ids, tail } = await readLog([`${before}${whole}\n`], null);
    expect(ids.get(ROOT)).toBe(KANAME);
    expect(ids.get(`${ROOT}/accounting`)).toBe(MINORI);
    expect(tail).toBeNull();
  });

  it('joins lines split across chunks and keeps the earlier lines of the log', async () => {
    const text = `\n${KANAME_OLD} ${ROOT}${whole}${before}`;
    const chunks = [text.slice(0, 20), text.slice(20, 61), text.slice(61)];
    const { ids } = await readLog(chunks, null);
    // The last line (かなめ's new session) waits; the lines before it count as ever.
    expect([...ids]).toEqual([
      [ROOT, KANAME_OLD],
      [`${ROOT}/accounting`, MINORI],
    ]);
  });

  it('keeps no text of the last line in its mark', async () => {
    const { tail } = await readLog([`\n${OTHER} ${OTHER_PATH}`], null);
    expect(JSON.stringify(tail)).not.toMatch(new RegExp(`${OTHER}|${OTHER_PATH}`));
  });
});

describe('sessionStateOf', () => {
  const entry = (over: Partial<ActivityEntry>): ActivityEntry => ({
    working: false,
    waiting: false,
    event: null,
    ...over,
  });

  it.each([
    ['no entry', undefined, 'idle'],
    [
      'waiting on a Notification',
      entry({ waiting: true, event: 'Notification' }),
      'awaiting-permission',
    ],
    [
      'a Notification while also working',
      entry({ waiting: true, working: true, event: 'Notification' }),
      'awaiting-permission',
    ],
    ['working', entry({ working: true, event: 'PreToolUse' }), 'working'],
    [
      'working with a stale Notification but not waiting',
      entry({ working: true, event: 'Notification' }),
      'working',
    ],
    ['waiting after Stop', entry({ waiting: true, event: 'Stop' }), 'resting'],
    ['waiting after MarkedUnread', entry({ waiting: true, event: 'MarkedUnread' }), 'resting'],
    ['waiting with no event', entry({ waiting: true }), 'resting'],
    ['neither flag', entry({ event: 'Stop' }), 'idle'],
  ] as const)('%s → %s', (_label, value, state) => {
    expect(sessionStateOf(value)).toBe(state);
  });
});

const SEAT_IDS = new Map([
  [ROOT, KANAME],
  [`${ROOT}/accounting`, MINORI],
]);

describe('readSeatStates', () => {
  it('gives every seat a state, idle when it has no session or no entry', () => {
    const text = JSON.stringify({
      [KANAME]: { working: true, waiting: false, event: 'PreToolUse' },
      [MINORI]: { working: false, waiting: true, event: 'Notification', extra: 1 },
    });
    expect(readSeatStates(text, SEATS, SEAT_IDS)).toEqual({
      ok: true,
      found: 2,
      members: [
        { department: null, state: 'working' },
        { department: '経理', state: 'awaiting-permission' },
        { department: '広報', state: 'idle' },
        { department: '企画', state: 'idle' },
        { department: '総務', state: 'idle' },
      ],
      guests: [],
      guestsFound: 0,
    });
  });

  it('never looks at other keys, even broken ones', () => {
    const text = JSON.stringify({
      [OTHER]: { working: 'yes' },
      [KANAME]: { working: false, waiting: true, event: 'Stop' },
    });
    const result = readSeatStates(text, SEATS, SEAT_IDS);
    expect(result).toMatchObject({ ok: true });
    expect(JSON.stringify(result)).not.toContain(OTHER);
  });

  it('does not take an inherited key for an entry', () => {
    const toString = new Map([[ROOT, 'toString']]);
    const result = readSeatStates('{}', SEATS, toString);
    expect(result.ok && result.members[0]).toEqual({ department: null, state: 'idle' });
  });
});

describe('seatStatesOf: other keys are not touched', () => {
  /** The file as parsed, recording every key listed or read. Another key throws when read. */
  function watchedFile(file: Record<string, unknown>) {
    const read: string[] = [];
    let listed = false;
    const proxy = new Proxy(file, {
      get(target, key, receiver) {
        if (typeof key === 'string') read.push(key);
        if (key === OTHER) throw new Error('another key was read');
        const value: unknown = Reflect.get(target, key, receiver);
        return value;
      },
      ownKeys(target) {
        listed = true;
        return Reflect.ownKeys(target);
      },
    });
    return { proxy, read, listed: () => listed };
  }

  it('reads only the company ids, never listing or reading another (broken) key', () => {
    const file = watchedFile({
      [OTHER]: { working: 'broken' },
      [KANAME]: { working: true, waiting: false, event: null },
    });
    const result = seatStatesOf(file.proxy, SEATS, SEAT_IDS);
    expect(result.ok && result.members[0]).toEqual({ department: null, state: 'working' });
    expect(file.listed()).toBe(false);
    expect(file.read).toEqual([KANAME]);
  });
});

describe('readSeatStates: failures', () => {
  it.each([
    ['an empty file', ''],
    ['half-written JSON', '{"aaaaaaaa-0000-4000-8000-000000000001":{"working":tr'],
    ['whitespace only', '  \n'],
  ])('fails with parse-failed for %s', (_label, text) => {
    expect(readSeatStates(text, SEATS, SEAT_IDS)).toEqual({ ok: false, kind: 'parse-failed' });
  });

  it.each([
    ['an array', '[]'],
    ['a string', '"x"'],
    ['null', 'null'],
    ['a company entry with a missing flag', JSON.stringify({ [KANAME]: { working: true } })],
    [
      'a company entry with a mistyped flag',
      JSON.stringify({ [KANAME]: { working: 'true', waiting: false, event: null } }),
    ],
    [
      'a company entry with a numeric event',
      JSON.stringify({ [MINORI]: { working: false, waiting: true, event: 1 } }),
    ],
    ['a company entry that is not an object', JSON.stringify({ [KANAME]: true })],
  ])('fails with invalid for %s', (_label, text) => {
    expect(readSeatStates(text, SEATS, SEAT_IDS)).toEqual({ ok: false, kind: 'invalid' });
  });

  it('works with no company session at all', () => {
    expect(readSeatStates('{}', SEATS, new Map())).toMatchObject({ ok: true, found: 0 });
  });
});
