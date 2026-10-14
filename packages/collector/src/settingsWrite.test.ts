import { describe, expect, it } from 'vitest';
import { checkGuildSettings, type GuildSettings } from '@conect-guild/snapshot/settingsSchema';
import { CollectorError } from './errors.ts';
import { NEXT_STEPS } from './settingsReport.ts';
import { runSettingsWrite } from './settingsWrite.ts';
import {
  APPEARED,
  BACKUP,
  DEFAULT_TEXT,
  fake,
  input,
  LABELS,
  LOCAL,
  ROOT,
  SECRET_LINE,
  type Fake,
} from './settingsWrite.fixtures.test-util.ts';

function written(f: Fake): GuildSettings {
  const text = f.files.get(LOCAL);
  if (text === undefined) throw new Error('not written');
  return checkGuildSettings(JSON.parse(text));
}

/** A local settings file that differs from the default in values the input does not carry. */
function localText(): string {
  const settings: unknown = JSON.parse(DEFAULT_TEXT);
  const base = checkGuildSettings(settings);
  return `${JSON.stringify(
    {
      ...base,
      members: { ...base.members, kaname: { name: 'かな', role: '受付係', color: '#123456' } },
      ruleChangePaths: [{ match: 'prefix', path: 'rules/' }],
    },
    null,
    2,
  )}\n`;
}

describe('runSettingsWrite --dry-run', () => {
  it('checks and shows the table without writing anything', async () => {
    const f = fake();
    expect(await runSettingsWrite(['--dry-run'], f.deps)).toBe(0);
    expect(f.writes).toEqual([]);
    const out = f.output();
    expect(out).toContain('確認（まだ書いていません）');
    expect(out).toContain('出発点: guild.settings.json');
    expect(out).toMatch(/\n {2}"広報"（departments\[1\]） +"pr\/" +見つかった +"~\/company\/pr"\n/);
    expect(out).not.toContain('上書き');
    expect(out).not.toContain('警告');
    expect(out).not.toContain(NEXT_STEPS[0]);
  });

  it('says that writing would replace the local settings, and still writes nothing', async () => {
    const f = fake();
    f.files.set(LOCAL, localText());
    expect(await runSettingsWrite(['--dry-run'], f.deps)).toBe(0);
    expect(f.writes).toEqual([]);
    expect(f.output()).toContain('出発点: guild.settings.local.json');
    expect(f.output()).toContain('書くと上書きになります（--write --overwrite で書き');
  });

  it('gives the same report as JSON for a skill', async () => {
    const f = fake();
    f.files.set(LOCAL, localText());
    expect(await runSettingsWrite(['--dry-run', '--json'], f.deps)).toBe(0);
    const report: unknown = JSON.parse(f.output());
    expect(report).toMatchObject({
      mode: 'dry-run',
      ok: true,
      written: false,
      base: 'guild.settings.local.json',
      overwrite: true,
      repo: 'me/company',
      keptBranchPrefixes: 4,
      warnings: [],
      errors: [],
    });
    expect(report).toHaveProperty('departments.0', {
      label: '経理',
      sessionDir: '~/company/accounting',
      prefix: 'accounting/',
      claudeMd: 'found',
    });
  });
});

describe('runSettingsWrite --write', () => {
  it('writes new local settings from the default, keeping what the input does not carry', async () => {
    const f = fake();
    expect(await runSettingsWrite(['--write'], f.deps)).toBe(0);
    expect(f.writes.map((w) => w.path)).toEqual([LOCAL]);
    const settings = written(f);
    const base = checkGuildSettings(JSON.parse(DEFAULT_TEXT));
    expect(settings.repo).toBe('me/company');
    expect(settings.commanderSessionDir).toBe('~/company');
    expect(settings.members).toEqual(base.members);
    expect(settings.ruleChangePaths).toEqual(base.ruleChangePaths);
    expect(settings.departments.map((d) => d.member)).toEqual(
      base.departments.map((d) => d.member),
    );
    expect(settings.branchPrefixes.slice(0, 4)).toEqual(
      input().departments.map((d) => ({ prefix: d.prefix, department: d.label })),
    );
    expect(settings.branchPrefixes.slice(4).map((row) => row.prefix)).toEqual([
      'docs/accounting-',
      'docs/pr-',
      'docs/planning-',
      'docs/general-affairs-',
    ]);
    expect(f.output()).toContain('書きました: guild.settings.local.json');
    for (const line of NEXT_STEPS) expect(f.output()).toContain(line);
  });
});

describe('runSettingsWrite --write over local settings', () => {
  it('refuses to replace local settings without --overwrite, writing nothing', async () => {
    const f = fake();
    const before = localText();
    f.files.set(LOCAL, before);
    expect(await runSettingsWrite(['--write'], f.deps)).toBe(1);
    expect(f.writes).toEqual([]);
    expect(f.files.get(LOCAL)).toBe(before);
    expect(f.output()).toContain('既にあります。上書きするなら --overwrite を付けてください');
  });

  it('with --overwrite keeps the old file as .bak first, then keeps its values', async () => {
    const f = fake();
    const before = localText();
    f.files.set(LOCAL, before);
    expect(await runSettingsWrite(['--write', '--overwrite'], f.deps)).toBe(0);
    expect(f.writes.map((w) => w.path)).toEqual([BACKUP, LOCAL]);
    expect(f.files.get(BACKUP)).toBe(before);
    const settings = written(f);
    expect(settings.members.kaname).toEqual({ name: 'かな', role: '受付係', color: '#123456' });
    expect(settings.ruleChangePaths).toEqual([{ match: 'prefix', path: 'rules/' }]);
    expect(f.output()).toContain('前の内容は guild.settings.local.json.bak に残しました');
  });

  it('writes no .bak when there were no local settings, even with --overwrite', async () => {
    const f = fake();
    expect(await runSettingsWrite(['--write', '--overwrite'], f.deps)).toBe(0);
    expect(f.writes.map((w) => w.path)).toEqual([LOCAL]);
  });

  it('stops when the .bak cannot be written, leaving the local settings as they were', async () => {
    const f = fake({ failWriteOf: BACKUP });
    const before = localText();
    f.files.set(LOCAL, before);
    expect(await runSettingsWrite(['--write', '--overwrite'], f.deps)).toBe(1);
    expect(f.files.get(LOCAL)).toBe(before);
    expect(f.output()).toContain('guild.settings.local.json を書けませんでした');
    expect(f.output()).not.toContain('EACCES');
  });

  it('never replaces local settings that appear between the check and the write', async () => {
    const f = fake({ appearsBeforeWrite: LOCAL });
    expect(await runSettingsWrite(['--write'], f.deps)).toBe(1);
    expect(f.files.get(LOCAL)).toBe(APPEARED);
    expect(f.writes).toEqual([]);
    expect(f.output()).toContain('guild.settings.local.json を書けませんでした');
  });

  it('reports a failed write as an error', async () => {
    const f = fake({ failWriteOf: LOCAL });
    expect(await runSettingsWrite(['--write', '--json'], f.deps)).toBe(1);
    expect(JSON.parse(f.output())).toMatchObject({ ok: false, written: false });
  });
});

describe('runSettingsWrite: input and settings that stop it', () => {
  const stops: [string, string, string][] = [
    ['not JSON', '{"repo": ', '標準入力を JSON として読めません（途中で終わっています）'],
    [
      'one department',
      JSON.stringify({ ...input(), departments: input().departments.slice(3) }),
      '入力の形が違います',
    ],
    ['an unknown key', JSON.stringify({ ...input(), members: {} }), '入力の形が違います'],
    [
      'a repo not owner/name',
      JSON.stringify({ ...input(), repo: 'company' }),
      '設定の検証で止まりました',
    ],
    [
      'a folder with a trailing /',
      JSON.stringify({ ...input(), commanderSessionDir: '~/company/' }),
      '設定の検証で止まりました',
    ],
  ];

  it.each(stops)('stops on %s, before asking gh and without writing', async (_, stdin, message) => {
    const f = fake({ stdin });
    expect(await runSettingsWrite(['--write'], f.deps)).toBe(1);
    expect(f.writes).toEqual([]);
    expect(f.ghCalls).toEqual([]);
    expect(f.output()).toContain(message);
  });
});

describe('runSettingsWrite: settings that stop it', () => {
  it('stops on two departments with the same label', async () => {
    const data = input();
    const [first, second] = data.departments;
    if (first === undefined || second === undefined) throw new Error('fixture');
    second.label = first.label;
    const f = fake({ stdin: JSON.stringify(data) });
    expect(await runSettingsWrite(['--write'], f.deps)).toBe(1);
    expect(f.output()).toContain('label "経理" twice');
    expect(f.writes).toEqual([]);
  });

  it('stops when a folder is not there', async () => {
    const f = fake();
    f.dirs.delete('/home/me/company/planning');
    expect(await runSettingsWrite(['--write'], f.deps)).toBe(1);
    expect(f.writes).toEqual([]);
    expect(f.output()).toContain(
      'departments[2].sessionDir のフォルダがありません: "~/company/planning"',
    );
  });

  it('stops when two folders are the same once ~ is expanded', async () => {
    const data = { ...input(), commanderSessionDir: '/home/me/company/pr' };
    const f = fake({ stdin: JSON.stringify(data) });
    expect(await runSettingsWrite(['--dry-run'], f.deps)).toBe(1);
    expect(f.output()).toContain(
      'departments[1].sessionDir は別の項目と同じフォルダを指しています',
    );
  });

  it('stops when the local settings are not JSON, naming the file', async () => {
    const f = fake();
    f.files.set(LOCAL, '{ repo: ');
    expect(await runSettingsWrite(['--write', '--overwrite'], f.deps)).toBe(1);
    expect(f.writes).toEqual([]);
    expect(f.output()).toContain('guild.settings.local.json を JSON として読めません');
  });

  it('stops while an old guild.settings.local.ts is there', async () => {
    const f = fake();
    f.files.set(`${ROOT}/guild.settings.local.ts`, 'export default {}');
    expect(await runSettingsWrite(['--write'], f.deps)).toBe(1);
    expect(f.writes).toEqual([]);
    expect(f.output()).toContain('guild.settings.local.ts は読まなくなりました');
  });

  it('prints the usage for wrong arguments without reading stdin', async () => {
    for (const args of [[], ['--dry-run', '--write'], ['--write', '--force'], ['--json']]) {
      const f = fake();
      expect(await runSettingsWrite(args, f.deps)).toBe(2);
      expect(f.output()).toContain('使い方:');
      expect(f.stdinReads()).toBe(0);
    }
  });
});

describe('runSettingsWrite: labels (warn and go on)', () => {
  it('warns about a label missing in the repository and still writes', async () => {
    const f = fake({ repoLabels: ['経理', '企画', '総務'] });
    expect(await runSettingsWrite(['--write'], f.deps)).toBe(0);
    expect(f.output()).toContain('departments[1]: ラベル "広報" がリポジトリにありません');
    expect(f.writes.map((w) => w.path)).toEqual([LOCAL]);
    expect(f.ghCalls[0]).toContain('repos/me/company/labels?per_page=100');
  });

  it('warns when gh fails and still writes (the collector checks again)', async () => {
    const f = fake({ repoLabels: new CollectorError('gh-failed') });
    expect(await runSettingsWrite(['--write'], f.deps)).toBe(0);
    expect(f.output()).toContain('ラベルを GitHub に問い合わせられませんでした（gh-failed）');
    expect(f.writes.map((w) => w.path)).toEqual([LOCAL]);
  });
});

describe('runSettingsWrite: departments mixed up (warn and go on)', () => {
  it('warns when two departments point at each other’s folders', async () => {
    const data = input();
    const [, pr, planning] = data.departments;
    if (pr === undefined || planning === undefined) throw new Error('fixture');
    [pr.sessionDir, planning.sessionDir] = [planning.sessionDir, pr.sessionDir];
    const f = fake({ stdin: JSON.stringify(data) });
    expect(await runSettingsWrite(['--dry-run'], f.deps)).toBe(0);
    const out = f.output();
    expect(out).toMatch(
      /"広報"（departments\[1\]） +"pr\/" +見つからない +"~\/company\/planning"\n/,
    );
    expect(out).toContain(
      'departments[1]: "~/company/planning" の CLAUDE.md にラベル "広報" が見つかりません。ほかの部門とフォルダが入れ替わっていませんか？',
    );
    expect(out).toContain('departments[2]: "~/company/pr" の CLAUDE.md にラベル "企画"');
    expect(out).toContain('departments[1]: 接頭辞 "pr/" とフォルダ名 "planning" が違います');
    expect(out).toContain('departments[2]: 接頭辞 "planning/" とフォルダ名 "pr" が違います');
  });

  it('warns when a department folder has no CLAUDE.md', async () => {
    const f = fake();
    f.files.delete('/home/me/company/accounting/CLAUDE.md');
    expect(await runSettingsWrite(['--write'], f.deps)).toBe(0);
    expect(f.output()).toMatch(
      /"経理"（departments\[0\]） +"accounting\/" +読めない +"~\/company\/accounting"\n/,
    );
    expect(f.output()).toContain('の CLAUDE.md を読めません（ラベルを突き合わせられません）');
  });

  it('never lets the text of a CLAUDE.md out, in the table, the JSON or the file', async () => {
    for (const args of [['--write'], ['--dry-run', '--json']]) {
      const f = fake();
      expect(await runSettingsWrite(args, f.deps)).toBe(0);
      expect(f.output()).not.toContain(SECRET_LINE);
      expect(f.output()).not.toContain('AI');
      for (const w of f.writes) expect(w.content).not.toContain(SECRET_LINE);
    }
  });
});

describe('runSettingsWrite: any string stays a string', () => {
  const tricky = [
    'say "hi"',
    'line\nbreak',
    '</script><script>alert(1)</script>',
    '\u001b[31mred',
    'back\\slash',
  ];

  it.each(tricky)(
    'writes the label %j as a JSON string that reads back the same',
    async (label) => {
      const data = input();
      const first = data.departments[0];
      if (first === undefined) throw new Error('fixture');
      first.label = label;
      const f = fake({ stdin: JSON.stringify(data), repoLabels: [label, ...LABELS] });
      expect(await runSettingsWrite(['--write'], f.deps)).toBe(0);
      const settings = written(f);
      expect(settings.departments[0]?.label).toBe(label);
      expect(settings.branchPrefixes[0]).toEqual({ prefix: 'accounting/', department: label });
      // Shown as characters: no raw line break or escape inside the table row.
      const row = f
        .output()
        .split('\n')
        .find((line) => line.includes('（departments[0]）'));
      expect(row).toContain(JSON.stringify(label));
    },
  );
});

describe('runSettingsWrite: messages that repeat a string from the input', () => {
  it('escapes a control character a schema error repeats from the input', async () => {
    const data = input();
    const [first, second] = data.departments;
    if (first === undefined || second === undefined) throw new Error('fixture');
    first.label = 'x\u001b[2J\u009b';
    second.label = first.label;
    const f = fake({ stdin: JSON.stringify(data) });
    expect(await runSettingsWrite(['--dry-run'], f.deps)).toBe(1);
    expect(f.output()).toContain('label "x\\u001b[2J\\u009b" twice');
    expect(f.output()).not.toContain('\u001b');
    expect(f.output()).not.toContain('\u009b');
  });

  it('keeps a schema error about a label with a line break on one line', async () => {
    const data = input();
    const [first, second] = data.departments;
    if (first === undefined || second === undefined) throw new Error('fixture');
    first.label = 'x\n  - 偽の行';
    second.label = first.label;
    const f = fake({ stdin: JSON.stringify(data) });
    expect(await runSettingsWrite(['--dry-run'], f.deps)).toBe(1);
    expect(f.output()).toContain('label "x\\n  - 偽の行" twice');
    expect(f.output()).not.toContain('\n  - 偽の行');
  });
});

describe('runSettingsWrite: bidi and other format characters', () => {
  it('escapes C1 controls and bidi overrides in the JSON too, which still reads back', async () => {
    const data = input();
    const first = data.departments[0];
    if (first === undefined) throw new Error('fixture');
    first.label = 'a\u009b\u202e\u200f\u061c\u{e0001}b';
    const f = fake({ stdin: JSON.stringify(data) });
    await runSettingsWrite(['--dry-run', '--json'], f.deps);
    expect(f.output()).not.toContain('\u009b');
    for (const char of ['\u202e', '\u200f', '\u061c']) expect(f.output()).not.toContain(char);
    expect(JSON.parse(f.output())).toHaveProperty(
      'departments.0.label',
      'a\u009b\u202e\u200f\u061c\u{e0001}b',
    );
  });

  it('keeps an unknown key with a line break on one line, in the input or the local file', async () => {
    const forged = 'x\n  - エラーはありません';
    const fromInput = fake({ stdin: JSON.stringify({ ...input(), [forged]: 1 }) });
    expect(await runSettingsWrite(['--dry-run'], fromInput.deps)).toBe(1);
    const fromLocal = fake();
    fromLocal.files.set(LOCAL, JSON.stringify({ ...JSON.parse(DEFAULT_TEXT), [forged]: 1 }));
    expect(await runSettingsWrite(['--dry-run'], fromLocal.deps)).toBe(1);
    for (const f of [fromInput, fromLocal]) {
      expect(f.output()).toContain('x\\u000a  - エラーはありません');
      expect(f.output()).not.toContain(forged);
    }
  });

  it('escapes bidi marks in the table and in a schema error', async () => {
    const data = input();
    const [first, second] = data.departments;
    if (first === undefined || second === undefined) throw new Error('fixture');
    first.label = 'a\u200e\u200f\u061cb';
    const table = fake({ stdin: JSON.stringify(data) });
    await runSettingsWrite(['--dry-run'], table.deps);
    expect(table.output()).toContain('"a\\u200e\\u200f\\u061cb"');
    second.label = first.label;
    const error = fake({ stdin: JSON.stringify(data) });
    expect(await runSettingsWrite(['--dry-run'], error.deps)).toBe(1);
    for (const f of [table, error]) {
      for (const char of ['\u200e', '\u200f', '\u061c']) expect(f.output()).not.toContain(char);
    }
  });

  it('shows a label with a line break on one line in the table', async () => {
    const data = input();
    const first = data.departments[0];
    if (first === undefined) throw new Error('fixture');
    first.label = 'a\nb\u001b[2J';
    const f = fake({ stdin: JSON.stringify(data) });
    await runSettingsWrite(['--dry-run'], f.deps);
    expect(f.output()).toContain('"a\\nb\\u001b[2J"（departments[0]）');
    expect(f.output()).not.toContain('\u001b');
  });
});
