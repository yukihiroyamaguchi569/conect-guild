import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadSettingsFile } from '@conect-guild/snapshot/settingsFile';
import { checkGuildSettings } from '@conect-guild/snapshot/settingsSchema';
import { claudeMdMentions, prefixMatchesFolder } from './settingsChecks.ts';
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
    const base = {
      ...BASE,
      members: { ...BASE.members, hibiki: { ...BASE.members.hibiki, role: '広報とSNS' } },
    };
    const data = input();
    data.departments = data.departments.map((d, i) => ({ ...d, label: `${LABELS[i] ?? ''}部` }));
    const { raw } = mergeSettings(base, data);
    expect(raw.members.minori.role).toBe('経理部');
    expect(raw.members.hibiki.role).toBe('広報とSNS');
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
    expect(escapeControls('a\nb\u001b\u009b\u202e')).toBe('a\nb\\u001b\\u009b\\u202e');
  });

  it('shows controls, quotes, line separators and bidi overrides as escapes', () => {
    expect(quote('a"b\n\u001b\u007f\u009b ‮')).toBe(
      '"a\\"b\\n\\u001b\\u007f\\u009b\\u2028\\u202e"',
    );
    expect(quote('経理')).toBe('"経理"');
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
      isDirectory: (path) => statSync(path, { throwIfNoEntry: false })?.isDirectory() ?? false,
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
