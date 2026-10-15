import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SETTINGS_ROOT } from '@conect-guild/snapshot/settingsFile';
import { describe, expect, it } from 'vitest';
import {
  TRIAL_DEPARTMENTS,
  parseScaffoldArgs,
  runTrialScaffold,
  trialDepartments,
  trialFiles,
  type ScaffoldDeps,
  type TrialFile,
} from './trialScaffold.ts';

// The real templates: a change to docs/orchestration.md that the tool can no longer fill fails here.
const DOC = readFileSync(join(SETTINGS_ROOT, 'docs', 'orchestration.md'), 'utf8');

function filesFor(count: number): TrialFile[] {
  const files = trialFiles(DOC, count);
  if (files === null) throw new Error('templates not found');
  return files;
}

function contentOf(files: readonly TrialFile[], path: string): string {
  const file = files.find((f) => f.path === path);
  if (file === undefined) throw new Error(`no ${path}`);
  return file.content;
}

function tableRows(commander: string): string[] {
  const lines = commander.split('\n');
  const header = lines.findIndex((line) => line.startsWith('| 部門 | 担当 |'));
  const rows: string[] = [];
  for (let i = header + 2; lines[i]?.startsWith('|') === true; i += 1) rows.push(lines[i] ?? '');
  return rows;
}

describe('parseScaffoldArgs', () => {
  it('takes --dir and --departments in either order', () => {
    expect(parseScaffoldArgs(['--dir', '/x/t', '--departments', '4'])).toEqual({
      dir: '/x/t',
      count: 4,
    });
    expect(parseScaffoldArgs(['--departments', '2', '--dir', '/x/t'])).toEqual({
      dir: '/x/t',
      count: 2,
    });
  });

  it.each([
    [[]],
    [['--dir', '/x/t']],
    [['--dir', '/x/t', '--departments', '1']],
    [['--dir', '/x/t', '--departments', '7']],
    [['--dir', '/x/t', '--departments', '4.5']],
    [['--dir', '/x/t', '--departments', 'four']],
    [['--dir', 'relative/t', '--departments', '4']],
    [['--dir', '~/t', '--departments', '4']],
    [['--dir', '/x/t\n', '--departments', '4']],
    [['--dir', '/x/t', '--dir', '/y/t']],
    [['--dir', '/x/t', '--repo', 'a/b']],
    [['--dir', '/x/t', '--departments', '4', '--extra']],
  ])('rejects %j', (args) => {
    expect(parseScaffoldArgs(args)).toBeNull();
  });
});

describe('trialFiles', () => {
  it.each([2, 4, 6])('writes the 司令塔, %i department folders and .gitignore', (count) => {
    const departments = TRIAL_DEPARTMENTS.slice(0, count);
    expect(filesFor(count).map((f) => f.path)).toEqual([
      'CLAUDE.md',
      ...departments.map((d) => `${d.folder}/CLAUDE.md`),
      '.gitignore',
    ]);
  });

  it.each([2, 4, 6])('the 司令塔 table has one row per department (%i)', (count) => {
    const rows = tableRows(contentOf(filesFor(count), 'CLAUDE.md'));
    expect(rows).toEqual(
      trialDepartments(count).map(
        (d) => `| ${d.name} | ${d.duty} | \`${d.folder}/\` | \`${d.label}\` | \`${d.folder}/\` |`,
      ),
    );
  });

  it('keeps the template table rows as they are for the four departments', () => {
    const template = DOC.slice(DOC.indexOf('| 部門 | 担当 |'));
    for (const row of tableRows(contentOf(filesFor(4), 'CLAUDE.md'))) {
      expect(template).toContain(row);
    }
  });

  it('fills 呼び名, names the trial company and keeps <owner/name> for the skill', () => {
    const commander = contentOf(filesFor(4), 'CLAUDE.md');
    expect(
      commander.startsWith(
        '# CLAUDE.md\n\nこれは conect-guild を試すための架空の会社「お試し商会」',
      ),
    ).toBe(true);
    expect(commander).not.toContain('<呼び名>');
    expect(commander).toContain('ユーザー（社長）を「社長」と呼ぶ');
    expect(commander).toContain('--repo <owner/name>');
    expect(commander).toContain('どこにも当てはまらない依頼は総務に振る');
  });

  it.each([
    [2, '広報'],
    [3, '企画'],
  ])('without 総務 (%i), the last department takes what fits nowhere', (count, last) => {
    const commander = contentOf(filesFor(count), 'CLAUDE.md');
    expect(commander).toContain(`どこにも当てはまらない依頼は${last}に振る`);
    expect(commander).not.toContain('総務');
    const d = TRIAL_DEPARTMENTS[count - 1];
    if (d === undefined) throw new Error('no department');
    expect(tableRows(commander).at(-1)).toContain(`| ${d.duty}、ほかに引き取り手のない仕事 |`);
    expect(contentOf(filesFor(count), `${d.folder}/CLAUDE.md`)).toContain(
      '- ほかに引き取り手のない仕事（司令塔から振られたもの）\n',
    );
  });

  it('with 総務 (4 and up), no other department takes what fits nowhere', () => {
    for (const count of [4, 5, 6]) {
      const files = filesFor(count);
      for (const d of TRIAL_DEPARTMENTS.slice(0, count).filter((x) => x.name !== '総務')) {
        expect(contentOf(files, `${d.folder}/CLAUDE.md`)).not.toContain('ほかに引き取り手のない');
      }
    }
  });
});

describe('department CLAUDE.md', () => {
  it.each(TRIAL_DEPARTMENTS.map((d) => [d.folder, d] as const))(
    '%s/CLAUDE.md names its own department, label, folder and rule only',
    (folder, d) => {
      const md = contentOf(filesFor(6), `${folder}/CLAUDE.md`);
      expect(
        md.startsWith(`# ${d.name} AI\n\nこれは conect-guild を試すための架空の会社「お試し商会」`),
      ).toBe(true);
      expect(md).toContain(`\`${d.label}\` ラベル`);
      expect(md).toContain(`書き込んでよいのは \`${folder}/\` だけ`);
      expect(md).toContain(
        `git worktree add -b ${folder}/<Issue 番号>-<短い英語> --no-track ../.claude/worktrees/${folder}-<Issue 番号> origin/main`,
      );
      expect(md).toContain(`cd ../.claude/worktrees/${folder}-<Issue 番号>/${folder}\n`);
      expect(md).toContain(`## ${d.name}固有のルール\n- ${d.rule}\n`);
      const scope = d.scope.map((line) => '- ' + line).join('\n');
      expect(md).toContain(`## 担当範囲\n${scope}\n\n担当外`);
      expect(md.endsWith('\n')).toBe(true);
      if (d.name !== '広報') {
        expect(md).not.toContain('広報');
        expect(md).not.toMatch(/`pr\/|pr\/<|pr-<|\/pr\n/);
      }
      expect(md).toContain('gh pr view <番号>');
    },
  );
});

describe('trialFiles details', () => {
  it('ignores worktrees in .gitignore', () => {
    expect(contentOf(filesFor(2), '.gitignore')).toBe('.claude/worktrees/\n');
  });

  it.each([
    ['no templates', 'no blocks here'],
    ['only one template', '````markdown\n# CLAUDE.md\n````\n'],
    [
      'a 司令塔 template without the table',
      '````markdown\n# CLAUDE.md\n<呼び名> どこにも当てはまらない依頼は総務に振る\n````\n' +
        DOC.slice(DOC.indexOf('## 5.')),
    ],
    [
      'a department template without its rule section',
      DOC.replace('## 広報固有のルール', '## 決まり'),
    ],
  ])('returns null for %s', (_, doc) => {
    expect(trialFiles(doc, 4)).toBeNull();
  });
});

function fakeDeps(state: 'missing' | 'empty' | 'used', doc = DOC) {
  const written = new Map<string, string>();
  const out: string[] = [];
  const err: string[] = [];
  const deps: ScaffoldDeps = {
    readDoc: () => doc,
    dirState: () => state,
    writeNew: (path, content) => {
      written.set(path, content);
    },
    out: (text) => out.push(text),
    err: (text) => err.push(text),
  };
  return { deps, written, out, err };
}

describe('runTrialScaffold', () => {
  it.each(['missing', 'empty'] as const)(
    'writes into a %s folder and prints the departments',
    (state) => {
      const { deps, written, out, err } = fakeDeps(state);
      expect(runTrialScaffold(['--dir', '/t/c', '--departments', '5'], deps)).toBe(0);
      expect([...written.keys()]).toEqual([
        '/t/c/CLAUDE.md',
        '/t/c/accounting/CLAUDE.md',
        '/t/c/pr/CLAUDE.md',
        '/t/c/planning/CLAUDE.md',
        '/t/c/general-affairs/CLAUDE.md',
        '/t/c/dev/CLAUDE.md',
        '/t/c/.gitignore',
      ]);
      expect(err).toEqual([]);
      const printed: unknown = JSON.parse(out.join(''));
      expect(printed).toEqual({
        dir: '/t/c',
        departments: TRIAL_DEPARTMENTS.slice(0, 5).map((d) => ({
          name: d.name,
          label: d.label,
          folder: d.folder,
          prefix: `${d.folder}/`,
        })),
      });
    },
  );

  it('stops without writing when the folder is in use', () => {
    const { deps, written, out, err } = fakeDeps('used');
    expect(runTrialScaffold(['--dir', '/t/c', '--departments', '4'], deps)).toBe(1);
    expect(written.size).toBe(0);
    expect(out).toEqual([]);
    expect(err.join('')).toContain('空ではありません');
  });

  it('stops without writing when the templates moved', () => {
    const { deps, written, err } = fakeDeps('missing', 'nothing');
    expect(runTrialScaffold(['--dir', '/t/c', '--departments', '4'], deps)).toBe(1);
    expect(written.size).toBe(0);
    expect(err.join('')).toContain('雛形の形が変わって');
  });

  it('prints the usage for bad arguments and touches nothing', () => {
    const { deps, written, err } = fakeDeps('missing');
    expect(runTrialScaffold(['--dir', '/t/c'], deps)).toBe(2);
    expect(written.size).toBe(0);
    expect(err.join('')).toContain('使い方');
  });
});
