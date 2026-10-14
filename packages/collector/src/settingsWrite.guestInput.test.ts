import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { checkGuildSettings, type GuildSettings } from '@conect-guild/snapshot/settingsSchema';
import { runSettingsWrite } from './settingsWrite.ts';
import {
  claudeMd,
  DEFAULT_TEXT,
  fake,
  HOME,
  input,
  LABELS,
  LOCAL,
  type Fake,
  type FakeOptions,
} from './settingsWrite.fixtures.test-util.ts';

/** Issue #118: guests in the input of `npm run settings:write`. */

function written(f: Fake): GuildSettings {
  const text = f.files.get(LOCAL);
  if (text === undefined) throw new Error('not written');
  return checkGuildSettings(JSON.parse(text));
}

function localWith(extra: object): string {
  return `${JSON.stringify({ ...checkGuildSettings(JSON.parse(DEFAULT_TEXT)), ...extra }, null, 2)}\n`;
}

const SIDE = join(HOME, 'side');
const APP = join(HOME, 'app');

/** A fake with the folders ~/side (origin me/side) and ~/app (no origin). */
function fakeWithFolders(stdin: object, options: FakeOptions = {}): Fake {
  const f = fake({
    stdin: JSON.stringify(stdin),
    gitRemotes: { [SIDE]: 'https://github.com/me/side.git' },
    ...options,
  });
  f.dirs.add(SIDE);
  f.dirs.add(APP);
  return f;
}

const jsonReportSchema = z.object({
  companyKept: z.boolean(),
  guestsFrom: z.string(),
  maxGuests: z.number().nullable(),
  guests: z.array(
    z.object({
      name: z.string(),
      sessionDir: z.string(),
      repo: z.string().nullable(),
      repoFrom: z.string(),
    }),
  ),
});

function jsonReport(f: Fake): z.infer<typeof jsonReportSchema> {
  return jsonReportSchema.parse(JSON.parse(f.output()));
}

describe('settings:write with guests in the input (Issue #118)', () => {
  it('adds guests, suggesting the repo from the folder origin', async () => {
    const f = fakeWithFolders({
      ...input(),
      guests: [
        { name: 'たびびと', sessionDir: '~/side' },
        { name: 'ぼうけんしゃ', sessionDir: '~/app' },
      ],
    });
    expect(await runSettingsWrite(['--write', '--json'], f.deps)).toBe(0);
    expect(written(f).guests).toEqual([
      { name: 'たびびと', sessionDir: '~/side', repo: 'me/side' },
      { name: 'ぼうけんしゃ', sessionDir: '~/app' },
    ]);
    const report = jsonReport(f);
    expect(report.guestsFrom).toBe('input');
    expect(report.maxGuests).toBe(2);
    expect(report.guests.map((g) => [g.repo, g.repoFrom])).toEqual([
      ['me/side', 'git'],
      [null, 'none'],
    ]);
    expect(f.gitCalls).toEqual([
      ['-C', SIDE, 'remote', 'get-url', 'origin'],
      ['-C', APP, 'remote', 'get-url', 'origin'],
    ]);
  });

  it('takes a repo as given and asks git nothing; null means none', async () => {
    const f = fakeWithFolders({
      guests: [
        { name: 'たびびと', sessionDir: '~/side', repo: 'me/other' },
        { name: 'ぼうけんしゃ', sessionDir: '~/app', repo: null },
      ],
    });
    expect(await runSettingsWrite(['--write'], f.deps)).toBe(0);
    expect(written(f).guests).toEqual([
      { name: 'たびびと', sessionDir: '~/side', repo: 'me/other' },
      { name: 'ぼうけんしゃ', sessionDir: '~/app' },
    ]);
    expect(f.gitCalls).toEqual([]);
  });

  it('replaces the starting guests as a whole', async () => {
    const f = fakeWithFolders({ guests: [{ name: 'あたらしい', sessionDir: '~/app' }] });
    f.files.set(LOCAL, localWith({ guests: [{ name: 'ふるい', sessionDir: '~/side' }] }));
    expect(await runSettingsWrite(['--write', '--overwrite'], f.deps)).toBe(0);
    expect(written(f).guests).toEqual([{ name: 'あたらしい', sessionDir: '~/app' }]);
  });

  it('removes the guests key for an empty list', async () => {
    const f = fakeWithFolders({ guests: [] });
    f.files.set(LOCAL, localWith({ guests: [{ name: 'ふるい', sessionDir: '~/side' }] }));
    expect(await runSettingsWrite(['--write', '--overwrite'], f.deps)).toBe(0);
    expect(f.files.get(LOCAL)).not.toContain('guests');
  });
});

describe('settings:write stops on guests it cannot write (Issue #118)', () => {
  it('stops past the limit of the departments and writes nothing', async () => {
    const data = input();
    data.departments.push({ label: '開発', sessionDir: '~/company/dev', prefix: 'dev/' });
    const f = fakeWithFolders(
      {
        ...data,
        guests: [
          { name: 'たびびと', sessionDir: '~/side' },
          { name: 'ぼうけんしゃ', sessionDir: '~/app' },
        ],
      },
      { repoLabels: [...LABELS, '開発'] },
    );
    f.dirs.add(join(HOME, 'company', 'dev'));
    f.files.set(join(HOME, 'company', 'dev', 'CLAUDE.md'), claudeMd('開発'));
    expect(await runSettingsWrite(['--write'], f.deps)).toBe(1);
    expect(f.writes).toEqual([]);
    expect(f.output()).toContain('at most 1 guests with 5 departments (#108)');
  });

  it('stops when a suggested repo is the company repo', async () => {
    const f = fakeWithFolders(
      { guests: [{ name: 'たびびと', sessionDir: '~/side' }] },
      { gitRemotes: { [SIDE]: 'git@github.com:yukihiroyamaguchi569/conect-management.git' } },
    );
    expect(await runSettingsWrite(['--write'], f.deps)).toBe(1);
    expect(f.writes).toEqual([]);
    expect(f.output()).toContain('guests[0].repo');
  });

  it('stops on more than two guests before asking git anything', async () => {
    const f = fakeWithFolders({
      guests: ['a', 'b', 'c'].map((name) => ({ name, sessionDir: '~/side' })),
    });
    expect(await runSettingsWrite(['--write'], f.deps)).toBe(1);
    expect(f.writes).toEqual([]);
    expect(f.gitCalls).toEqual([]);
    expect(f.output()).toContain('入力の形が違います');
  });

  it('stops on a guest folder that is not there', async () => {
    const f = fakeWithFolders({ guests: [{ name: 'たびびと', sessionDir: '~/nowhere' }] });
    expect(await runSettingsWrite(['--write'], f.deps)).toBe(1);
    expect(f.writes).toEqual([]);
    expect(f.output()).toContain('guests[0].sessionDir のフォルダがありません');
    expect(f.gitCalls).toEqual([]);
  });

  it('stops on a guest folder that is a company folder once ~ is expanded', async () => {
    const f = fakeWithFolders({
      ...input(),
      guests: [{ name: 'たびびと', sessionDir: join(HOME, 'company', 'pr') }],
    });
    expect(await runSettingsWrite(['--write'], f.deps)).toBe(1);
    expect(f.writes).toEqual([]);
    expect(f.output()).toContain('guests[0].sessionDir は別の項目と同じフォルダを指しています');
  });
});

describe('settings:write with guests only, and its report (Issue #118)', () => {
  it('keeps the company values of the starting settings for a guests-only input', async () => {
    const f = fakeWithFolders({ guests: [{ name: 'たびびと', sessionDir: '~/side' }] });
    expect(await runSettingsWrite(['--write', '--json'], f.deps)).toBe(0);
    const { guests, ...company } = written(f);
    expect(company).toEqual(checkGuildSettings(JSON.parse(DEFAULT_TEXT)));
    expect(guests).toHaveLength(1);
    expect(jsonReport(f).companyKept).toBe(true);
    // The company's labels are not checked again: gh is not called.
    expect(f.ghCalls).toEqual([]);
  });

  it('shows the guests in the table for a person', async () => {
    const f = fakeWithFolders({ guests: [{ name: 'たびびと', sessionDir: '~/side' }] });
    expect(await runSettingsWrite(['--dry-run'], f.deps)).toBe(0);
    expect(f.output()).toContain('会社の値（repo・司令塔のフォルダ・部門）: 出発点のまま');
    expect(f.output()).toContain(
      '"たびびと"（guests[0]）  "me/side"（フォルダの git の origin から提案）  "~/side"',
    );
  });

  it('stops on part of the company values', async () => {
    const f = fakeWithFolders({ repo: 'me/company', guests: [] });
    expect(await runSettingsWrite(['--write'], f.deps)).toBe(1);
    expect(f.writes).toEqual([]);
    expect(f.output()).toContain('required with repo');
  });
});
