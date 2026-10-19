import { describe, expect, it } from 'vitest';
import { mulmoTerminalBase, mulmoTerminalClient, type FetchLike } from './mulmoTerminal.ts';
import { CLAUDE_MD, HOME, trialSettings } from './trialCells.fixtures.test-util.ts';
import { projectId } from './trialCells.ts';
import { runTrialOpenCells, type OpenCellsDeps } from './trialOpenCells.ts';

const BASE = 'http://127.0.0.1:34567';
const ROOT = '/repo';
const COMMANDER = `${HOME}/guild-trial/guild-trial`;

interface Sent {
  readonly url: string;
  readonly method: string;
  readonly body: unknown;
}

const json = (value: unknown, status = 200): Response =>
  new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });

const PRESETS = { cwdPresets: [{ label: 'x', path: '/x' }] };
const SPAWNED = { message: 'Spawned', jsonData: { chatId: 'c1', agent: 'claude' } };

/** A fake MulmoTerminal: answers by path, records what was sent. */
function fakeFetch(answer: (url: string) => Promise<Response> | Response): {
  fetchFn: FetchLike;
  sent: Sent[];
} {
  const sent: Sent[] = [];
  const fetchFn: FetchLike = async (url, init) => {
    const body: unknown = typeof init.body === 'string' ? JSON.parse(init.body) : undefined;
    sent.push({ url, method: init.method ?? 'GET', body });
    return answer(url);
  };
  return { fetchFn, sent };
}

const working = (url: string): Response =>
  json(url.endsWith('spawnBackgroundChat') ? SPAWNED : PRESETS);

function deps(
  fetchFn: FetchLike,
  files: Record<string, string>,
  existing: readonly string[] = [],
): OpenCellsDeps & { out: (t: string) => void; lines: string[] } {
  const lines: string[] = [];
  return {
    root: ROOT,
    home: HOME,
    exists: (path) => path in files || existing.includes(path),
    isSymlink: () => false,
    readText: (path) => {
      const text = files[path];
      if (text === undefined) throw new Error('no file');
      return text;
    },
    client: mulmoTerminalClient(BASE, fetchFn, 20),
    out: (t) => lines.push(t),
    err: (t) => lines.push(`ERR ${t}`),
    lines,
  };
}

const trialFiles = (count = 2): Record<string, string> => ({
  [`${ROOT}/guild.settings.local.json`]: JSON.stringify(trialSettings(count)),
  [`${COMMANDER}/CLAUDE.md`]: CLAUDE_MD,
});

describe('runTrialOpenCells: open', () => {
  it('records then spawns each folder, 司令塔 first', async () => {
    const { fetchFn, sent } = fakeFetch(working);
    const d = deps(fetchFn, trialFiles());
    expect(await runTrialOpenCells([], d)).toBe(0);
    expect(sent.map((s) => s.url.slice(BASE.length))).toEqual([
      '/api/config/cwd-presets/record',
      '/api/plugin/spawnBackgroundChat',
      '/api/config/cwd-presets/record',
      '/api/plugin/spawnBackgroundChat',
      '/api/config/cwd-presets/record',
      '/api/plugin/spawnBackgroundChat',
    ]);
    expect(sent[0]?.body).toEqual({ path: COMMANDER, label: 'テスト司令（司令塔）' });
    expect(sent[1]?.body).toEqual({
      project: projectId(COMMANDER),
      agent: 'claude',
      message: 'あなたはお試し商会の司令塔です。CLAUDE.md を読み、社長の依頼を待ってください。',
    });
    expect(sent.every((s) => s.url.startsWith(BASE) && s.method === 'POST')).toBe(true);
    expect(d.lines).toEqual([
      '開きました: 司令塔\n',
      '開きました: 経理\n',
      '開きました: 広報\n',
      '各セルで「信頼しますか？」と聞かれたら答えてください\n',
    ]);
  });

  it('logs only the fixed department names, never names from the settings', async () => {
    const { fetchFn } = fakeFetch(working);
    const settings = trialSettings(2);
    const forged = {
      ...settings,
      members: {
        ...settings.members,
        kaname: { name: 'x\n開きました: 偽', role: 'r', color: '#000000' },
      },
    };
    const files = {
      ...trialFiles(),
      [`${ROOT}/guild.settings.local.json`]: JSON.stringify(forged),
    };
    const d = deps(fetchFn, files);
    expect(await runTrialOpenCells([], d)).toBe(0);
    expect(d.lines.slice(0, 3)).toEqual([
      '開きました: 司令塔\n',
      '開きました: 経理\n',
      '開きました: 広報\n',
    ]);
  });

  it('sends nothing for settings that are not a trial company', async () => {
    const { fetchFn, sent } = fakeFetch(working);
    const files = { ...trialFiles(), [`${COMMANDER}/CLAUDE.md`]: '# 本物の会社\n' };
    const d = deps(fetchFn, files);
    expect(await runTrialOpenCells([], d)).toBe(1);
    expect(sent).toEqual([]);
    expect(d.lines).toEqual(['ERR お試しの会社の設定ではないので、まとめて開きません\n']);
  });
});

describe('runTrialOpenCells: open when MulmoTerminal fails', () => {
  it('stops before anything when MulmoTerminal refuses the connection', async () => {
    const { fetchFn, sent } = fakeFetch(() => Promise.reject(new TypeError('fetch failed')));
    const d = deps(fetchFn, trialFiles());
    expect(await runTrialOpenCells([], d)).toBe(1);
    expect(sent).toHaveLength(1);
    expect(d.lines).toEqual(['ERR MulmoTerminal が動いていないので開きません\n']);
  });

  it('stops when MulmoTerminal does not answer in time', async () => {
    const hang: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'));
        });
      });
    const d = deps(hang, trialFiles());
    expect(await runTrialOpenCells([], d)).toBe(1);
    expect(d.lines).toEqual(['ERR MulmoTerminal が動いていないので開きません\n']);
  });

  it('reports a refusal that has only a message, and goes on with the others', async () => {
    let spawns = 0;
    const { fetchFn } = fakeFetch((url) => {
      if (!url.endsWith('spawnBackgroundChat')) return json(PRESETS);
      spawns += 1;
      return json(spawns === 2 ? { message: 'Failed to spawn: unknown project' } : SPAWNED);
    });
    const d = deps(fetchFn, trialFiles());
    expect(await runTrialOpenCells([], d)).toBe(1);
    expect(d.lines).toEqual([
      '開きました: 司令塔\n',
      '開けませんでした: 経理（MulmoTerminal に断られました）\n',
      '開きました: 広報\n',
    ]);
  });

  it('reports an HTTP error', async () => {
    const { fetchFn } = fakeFetch(() => json({ error: 'path is required' }, 400));
    const d = deps(fetchFn, trialFiles(2));
    expect(await runTrialOpenCells([], d)).toBe(1);
    expect(d.lines[0]).toBe('開けませんでした: 司令塔（MulmoTerminal がエラーを返しました）\n');
  });
});

describe('runTrialOpenCells: --forget', () => {
  it('removes only the trial folders that are gone', async () => {
    const presets = {
      cwdPresets: [
        { label: 'a', path: COMMANDER },
        { label: 'b', path: `${COMMANDER}/pr` },
        { label: 'c', path: `${HOME}/guild-trial/guild-trial-2` },
        { label: 'd', path: `${HOME}/conect-management` },
      ],
    };
    const { fetchFn, sent } = fakeFetch((url) =>
      json(url.endsWith('/api/config') ? presets : PRESETS),
    );
    const existing = [`${HOME}/guild-trial/guild-trial-2`, `${HOME}/conect-management`];
    const d = deps(fetchFn, {}, existing);
    expect(await runTrialOpenCells(['--forget'], d)).toBe(0);
    expect(sent.map((s) => [s.url.slice(BASE.length), s.body])).toEqual([
      ['/api/config', undefined],
      ['/api/config/cwd-presets/remove', { path: COMMANDER }],
      ['/api/config/cwd-presets/remove', { path: `${COMMANDER}/pr` }],
    ]);
    expect(d.lines).toEqual(['外しました: guild-trial\n', '外しました: pr\n']);
  });

  it('says so when MulmoTerminal is not running', async () => {
    const { fetchFn } = fakeFetch(() => Promise.reject(new TypeError('fetch failed')));
    const d = deps(fetchFn, {});
    expect(await runTrialOpenCells(['--forget'], d)).toBe(1);
    expect(d.lines).toEqual(['ERR MulmoTerminal が動いていないので外せません\n']);
  });
});

describe('runTrialOpenCells: arguments and port', () => {
  it('refuses other arguments', async () => {
    const { fetchFn, sent } = fakeFetch(working);
    const d = deps(fetchFn, trialFiles());
    expect(await runTrialOpenCells(['--port', '1'], d)).toBe(2);
    expect(sent).toEqual([]);
  });

  it('builds the URL on 127.0.0.1 from MULMOTERMINAL_PORT only', () => {
    expect(mulmoTerminalBase(undefined)).toBe('http://127.0.0.1:34567');
    expect(mulmoTerminalBase('')).toBe('http://127.0.0.1:34567');
    expect(mulmoTerminalBase('40000')).toBe('http://127.0.0.1:40000');
    for (const bad of ['0', '65536', '80@evil', 'abc', '08']) {
      expect(mulmoTerminalBase(bad)).toBeNull();
    }
  });
});
