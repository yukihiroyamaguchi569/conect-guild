import { chmod, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadSettingsFile } from '@conect-guild/snapshot/settingsFile';
import { checkGuildSettings } from '@conect-guild/snapshot/settingsSchema';
import { claudeMdMentions, isDirectoryOnDisk, prefixMatchesFolder } from './settingsChecks.ts';
import { mergeSettings } from './settingsInput.ts';
import { escapeControls, quote } from './settingsText.ts';
import { parseWriteArgs, runSettingsWrite } from './settingsWrite.ts';
import {
  claudeMd,
  DEFAULT_TEXT,
  FOLDERS,
  input,
  LABELS,
} from './settingsWrite.fixtures.test-util.ts';
import { createFileExclusive, writeFileAtomic } from './write.ts';

const BASE = checkGuildSettings(JSON.parse(DEFAULT_TEXT));

describe('parseWriteArgs', () => {
  it('takes exactly one of --dry-run and --write, with --overwrite and --json', () => {
    expect(parseWriteArgs(['--dry-run'])).toEqual({
      mode: 'dry-run',
      overwrite: false,
      json: false,
    });
    expect(parseWriteArgs(['--json', '--write', '--overwrite'])).toEqual({
      mode: 'write',
      overwrite: true,
      json: true,
    });
  });

  it.each([[[]], [['--write', '--dry-run']], [['--write', '--write']], [['--write', 'x.json']]])(
    'refuses %j',
    (args) => {
      expect(parseWriteArgs(args)).toBeNull();
    },
  );
});

describe('mergeSettings', () => {
  it('lets a role follow its label only where it was the old label', () => {
    const { hibiki } = BASE.members;
    if (hibiki === undefined) throw new Error('guild.settings.json lacks hibiki');
    const base = {
      ...BASE,
      members: { ...BASE.members, hibiki: { ...hibiki, role: '広報とSNS' } },
    };
    const data = input();
    data.departments = data.departments.map((d, i) => ({ ...d, label: `${LABELS[i] ?? ''}部` }));
    const { raw } = mergeSettings(base, data);
    expect(raw.members.minori?.role).toBe('経理部');
    expect(raw.members.hibiki?.role).toBe('広報とSNS');
    expect(raw.members.kaname).toEqual(BASE.members.kaname);
  });

  it('keeps the old rows of the labels still there, but not of a prefix the input sets again', () => {
    const data = input();
    data.departments = data.departments.map((d, i) =>
      i === 0 ? { ...d, label: 'お金' } : { ...d, prefix: i === 1 ? 'docs/pr-' : d.prefix },
    );
    const merged = mergeSettings(BASE, data);
    expect(merged.raw.branchPrefixes.slice(4)).toEqual([
      { prefix: 'pr/', department: '広報' },
      { prefix: 'docs/planning-', department: '企画' },
      { prefix: 'docs/general-affairs-', department: '総務' },
    ]);
    expect(merged.keptBranchPrefixes).toBe(3);
  });
});

describe('mergeSettings with another number of departments (Issue #18)', () => {
  const twoOf = (settings: typeof BASE) => ({
    ...settings,
    departments: settings.departments.slice(0, 2),
    branchPrefixes: settings.branchPrefixes.filter((row) =>
      ['経理', '広報'].includes(row.department),
    ),
  });

  it('keeps the members of the positions it keeps when there are fewer', () => {
    const data = input();
    data.departments = data.departments.slice(0, 3);
    const { raw } = mergeSettings(BASE, data);
    expect(raw.departments.map((d) => d.member)).toEqual(['minori', 'hibiki', 'hirame']);
    // The member left without a department keeps its entry (and its role) as it was.
    expect(raw.members.sasae).toEqual(BASE.members.sasae);
  });

  it('gives a new position the next member no department uses, with the new label as role', () => {
    const base = twoOf({
      ...BASE,
      departments: [BASE.departments[1], BASE.departments[0], ...BASE.departments.slice(2)].filter(
        (d) => d !== undefined,
      ),
    });
    const data = input();
    data.departments = data.departments
      .slice(0, 3)
      .map((d, i) => (i === 2 ? { ...d, label: '研究' } : d));
    const { raw } = mergeSettings(base, data);
    expect(raw.departments.map((d) => d.member)).toEqual(['hibiki', 'minori', 'hirame']);
    expect(raw.members.hirame?.role).toBe('研究');
    expect(checkGuildSettings(raw).departments).toHaveLength(3);
  });

  it('leaves a member the starting settings do not have missing, for the schema to name', () => {
    const members = Object.fromEntries(
      Object.entries(BASE.members).filter(([id]) => id !== 'hirame'),
    );
    const data = input();
    data.departments = data.departments.slice(0, 3);
    const { raw } = mergeSettings({ ...twoOf(BASE), members }, data);
    expect(raw.departments[2]?.member).toBe('hirame');
    expect(raw.members.hirame).toBeUndefined();
    expect(() => checkGuildSettings(raw)).toThrow(/members\.hirame/);
  });
});

describe('prefixMatchesFolder', () => {
  it.each([
    ['accounting/', '~/company/accounting', true],
    ['accounting', '/abs/accounting', true],
    ['pr/', '~/company/planning', false],
    ['acct/', '~/company/accounting', false],
  ])('%s against %s is %s', (prefix, dir, expected) => {
    expect(prefixMatchesFolder(prefix, dir)).toBe(expected);
  });
});

describe('claudeMdMentions', () => {
  const reader = (text: string | null) => ({
    home: '/home/me',
    isDirectory: () => true,
    readText: () => {
      if (text === null) throw new Error('ENOENT');
      return text;
    },
  });

  it('answers only found, not-found or no-file', () => {
    expect(claudeMdMentions('/d', '経理', reader(claudeMd('経理')))).toBe('found');
    expect(claudeMdMentions('/d', '経理', reader(claudeMd('広報')))).toBe('not-found');
    expect(claudeMdMentions('/d', '経理', reader(null))).toBe('no-file');
  });
});

describe('quote', () => {
  it('escapes controls but keeps line breaks in a message', () => {
    expect(escapeControls('a\nb\u001b\u009b\u202e\u200f')).toBe('a\nb\\u001b\\u009b\\u202e\\u200f');
  });

  it('shows controls, quotes, line separators and bidi overrides as escapes', () => {
    expect(quote('a"b\n\u001b\u007f\u009b ‮')).toBe(
      '"a\\"b\\n\\u001b\\u007f\\u009b\\u2028\\u202e"',
    );
    expect(quote('経理')).toBe('"経理"');
  });
});

describe('isDirectoryOnDisk', () => {
  it('answers false, never throws, for a folder it may not look into or under a file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'is-directory-'));
    const locked = join(dir, 'locked');
    await mkdir(join(locked, 'inner'), { recursive: true });
    await chmod(locked, 0o000);
    try {
      expect(isDirectoryOnDisk(join(locked, 'inner'))).toBe(false);
    } finally {
      await chmod(locked, 0o700);
    }
    await writeFile(join(dir, 'file'), '');
    expect(isDirectoryOnDisk(join(dir, 'file', 'x'))).toBe(false);
    expect(isDirectoryOnDisk(join(dir, 'file'))).toBe(false);
    expect(isDirectoryOnDisk(locked)).toBe(true);
    await rm(dir, { recursive: true, force: true });
  });
});

describe('runSettingsWrite on real files', () => {
  let root = '';

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'settings-write-'));
    await writeFile(join(root, 'guild.settings.json'), DEFAULT_TEXT);
    for (const [i, folder] of FOLDERS.entries()) {
      await mkdir(join(root, 'home', 'company', folder), { recursive: true });
      await writeFile(
        join(root, 'home', 'company', folder, 'CLAUDE.md'),
        claudeMd(LABELS[i] ?? ''),
      );
    }
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  function run(args: string[]): Promise<number> {
    return runSettingsWrite(args, {
      root,
      home: join(root, 'home'),
      readStdin: () => Promise.resolve(JSON.stringify(input())),
      exists: existsSync,
      isDirectory: isDirectoryOnDisk,
      readText: (path) => readFileSync(path, 'utf8'),
      gh: () => Promise.resolve(LABELS.map((l) => `${JSON.stringify(l)}\n`).join('')),
      writeFile: writeFileAtomic,
      createFile: createFileExclusive,
      out: () => undefined,
    });
  }

  it('replaces the file atomically as 0600, keeps a 0600 .bak and reads back', async () => {
    const local = join(root, 'guild.settings.local.json');
    await writeFile(local, DEFAULT_TEXT, { mode: 0o644 });
    expect(await run(['--write', '--overwrite'])).toBe(0);
    expect((await stat(local)).mode & 0o777).toBe(0o600);
    expect((await stat(`${local}.bak`)).mode & 0o777).toBe(0o600);
    expect(await readFile(`${local}.bak`, 'utf8')).toBe(DEFAULT_TEXT);
    expect((await readdir(root)).filter((name) => name.endsWith('.tmp'))).toEqual([]);
    const loaded = loadSettingsFile(root, {
      exists: existsSync,
      readText: (path) => readFileSync(path, 'utf8'),
    });
    expect(loaded.file.name).toBe('guild.settings.local.json');
    expect(loaded.settings.repo).toBe('me/company');
  });

  it('creates new local settings as 0600 when there were none', async () => {
    expect(await run(['--write'])).toBe(0);
    expect((await stat(join(root, 'guild.settings.local.json'))).mode & 0o777).toBe(0o600);
    expect((await readdir(root)).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });

  it('writes nothing on a dry run', async () => {
    expect(await run(['--dry-run'])).toBe(0);
    expect((await readdir(root)).sort((a, b) => a.localeCompare(b))).toEqual([
      'guild.settings.json',
      'home',
    ]);
  });
});
