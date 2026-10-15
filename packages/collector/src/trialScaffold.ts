import { isAbsolute, join } from 'node:path';

/**
 * Issue #107: `npm run trial:scaffold -- --dir <folder> --departments <N>`. Writes a trial
 * company for /guild-trial: the 司令塔's CLAUDE.md, one folder with its CLAUDE.md per department
 * and a .gitignore. The CLAUDE.md files are the templates of docs/orchestration.md (chapters 4
 * and 5) filled with fixed values; nothing read from outside goes into them. It calls neither
 * git nor gh (the skill does).
 */

export const SCAFFOLD_USAGE =
  '使い方: npm run --silent trial:scaffold -- --dir <絶対パスのフォルダ> --departments <2〜6>\n';

export interface TrialDepartment {
  readonly name: string;
  readonly folder: string;
  readonly label: string;
  /** The 担当 column of the 司令塔's department table. */
  readonly duty: string;
  /** The bullets of the department's 担当範囲. */
  readonly scope: readonly string[];
  readonly rule: string;
}

/** The departments of a trial company, used from the top (the first four are the template's). */
export const TRIAL_DEPARTMENTS: readonly TrialDepartment[] = [
  {
    name: '経理',
    folder: 'accounting',
    label: '経理',
    duty: 'お金の出入りの記録、見積もり・請求の確認',
    scope: ['お金の出入りの記録', '見積もり・請求の確認'],
    rule: '担当の外部サービスが使えないときは、別の手段で代用せず、作業を止めて Issue で報告する',
  },
  {
    name: '広報',
    folder: 'pr',
    label: '広報',
    duty: '告知文・SNS・ウェブの文面',
    scope: ['告知文、SNS の投稿文、ウェブの文面の下書き', '発信の予定の管理'],
    rule: '下書きの作成までは自由に進めてよい。公開・投稿・送信は社長の承認を取ってから行う',
  },
  {
    name: '企画',
    folder: 'planning',
    label: '企画',
    duty: '新しい事業・サービスの計画',
    scope: ['新しい事業・サービスの計画'],
    rule: '予算や収支の数字を出したときは、経理の確認が要ることを報告に書く',
  },
  {
    name: '総務',
    folder: 'general-affairs',
    label: '総務',
    duty: 'ほかに引き取り手のない仕事すべて',
    scope: ['ほかに引き取り手のない仕事すべて'],
    rule: '原則として依頼を断らない。明らかに他部門の担当のものだけ、担当すべき部門を Issue に書いて司令塔に差し戻す',
  },
  {
    name: '開発',
    folder: 'dev',
    label: 'dev',
    duty: '社内の道具やウェブの小さな改修',
    scope: ['社内の道具やウェブの小さな改修'],
    rule: '公開しているものへの反映は社長の承認を取ってから行う',
  },
  {
    name: '営業',
    folder: 'sales',
    label: '営業',
    duty: '見込み客への提案と問い合わせへの返事',
    scope: ['見込み客への提案の下書き', '問い合わせへの返事の下書き'],
    rule: 'お客さんへの送信は社長の承認を取ってから行う',
  },
];

const MIN_DEPARTMENTS = 2;

const CATCH_ALL_DUTY = 'ほかに引き取り手のない仕事';

/**
 * The first `count` departments. Without 総務 (2 or 3), the last one takes what fits nowhere: its
 * 担当 and 担当範囲 say so, so it does not send back what the 司令塔 gives it as such.
 */
export function trialDepartments(count: number): TrialDepartment[] {
  const departments = TRIAL_DEPARTMENTS.slice(0, count);
  const last = departments.at(-1);
  if (last === undefined || departments.some((d) => d.name === '総務')) return departments;
  const catchAll = {
    ...last,
    duty: `${last.duty}、${CATCH_ALL_DUTY}`,
    scope: [...last.scope, `${CATCH_ALL_DUTY}（司令塔から振られたもの）`],
  };
  return [...departments.slice(0, -1), catchAll];
}

const TRIAL_NOTE =
  'これは conect-guild を試すための架空の会社「お試し商会」のものである。実在の会社・人・取引とは関係ない。';

export interface ScaffoldArgs {
  readonly dir: string;
  readonly count: number;
}

/** `--key value` pairs; null for an odd count or a key given twice. */
function argPairs(args: readonly string[]): Map<string, string> | null {
  const values = new Map<string, string>();
  for (let i = 0; i < args.length; i += 2) {
    const [key, value] = [args[i], args[i + 1]];
    if (key === undefined || value === undefined || values.has(key)) return null;
    values.set(key, value);
  }
  return values;
}

/** `--dir <absolute folder> --departments <2..6>`, in either order; null for anything else. */
export function parseScaffoldArgs(args: readonly string[]): ScaffoldArgs | null {
  const values = args.length === 4 ? argPairs(args) : null;
  const dir = values?.get('--dir');
  const count = Number(values?.get('--departments'));
  if (dir === undefined || !isAbsolute(dir) || /\p{Cc}/u.test(dir)) return null;
  if (!Number.isInteger(count) || count < MIN_DEPARTMENTS || count > TRIAL_DEPARTMENTS.length) {
    return null;
  }
  return { dir, count };
}

export interface Templates {
  readonly commander: string;
  readonly department: string;
}

/** The two ````markdown blocks of docs/orchestration.md: chapter 4 and chapter 5. */
export function extractTemplates(doc: string): Templates | null {
  const blocks = [...doc.matchAll(/^````markdown\n([\s\S]*?)\n````$/gm)].map((m) => m[1] ?? '');
  const [commander, department] = blocks;
  if (commander === undefined || department === undefined) return null;
  return { commander, department };
}

function withTrialNote(markdown: string): string {
  const [heading, ...rest] = markdown.split('\n');
  return [heading, '', TRIAL_NOTE, ...rest].join('\n');
}

function tableRow(d: TrialDepartment): string {
  return `| ${d.name} | ${d.duty} | \`${d.folder}/\` | \`${d.label}\` | \`${d.folder}/\` |`;
}

/** The template's department table with one row per department; null when it has none. */
function replaceTable(markdown: string, departments: readonly TrialDepartment[]): string | null {
  const lines = markdown.split('\n');
  const header = lines.findIndex((line) => line.startsWith('| 部門 | 担当 |'));
  if (header < 0) return null;
  let end = header + 2;
  while (lines[end]?.startsWith('|') === true) end += 1;
  lines.splice(header + 2, end - header - 2, ...departments.map(tableRow));
  return lines.join('\n');
}

const CATCH_ALL = 'どこにも当てはまらない依頼は総務に振る';

/** The 司令塔's CLAUDE.md; null when the template no longer has the parts it fills. */
export function commanderClaudeMd(
  template: string,
  departments: readonly TrialDepartment[],
): string | null {
  const table = replaceTable(template, departments);
  if (table === null || !table.includes('<呼び名>') || !table.includes(CATCH_ALL)) return null;
  // Without 総務, the last department takes what fits nowhere (chapter 4 says to keep them in line).
  const catchAll = departments.some((d) => d.name === '総務')
    ? '総務'
    : (departments.at(-1)?.name ?? '');
  const filled = table
    .replaceAll('<呼び名>', '社長')
    .replace(CATCH_ALL, `どこにも当てはまらない依頼は${catchAll}に振る`);
  return withTrialNote(filled);
}

const bullet = (text: string): string => `- ${text}\n`;

const EXAMPLE = { name: '広報', folder: 'pr' } as const;
const SCOPE_SECTION = /(## 担当範囲\n)(?:- .*\n)+/;
const RULE_SECTION = /(## 広報固有のルール\n)(?:- .*\n?)+$/;

/** A department's CLAUDE.md from the chapter 5 example (広報); null when its parts moved. */
export function departmentClaudeMd(template: string, d: TrialDepartment): string | null {
  if (!SCOPE_SECTION.test(template) || !RULE_SECTION.test(template)) return null;
  const f = d.folder;
  const filled = template
    .replace(SCOPE_SECTION, (_, head: string) => head + d.scope.map(bullet).join(''))
    .replace(RULE_SECTION, (_, head: string) => `${head}- ${d.rule}\n`)
    .replaceAll(`\`${EXAMPLE.name}\` ラベル`, `\`${d.label}\` ラベル`)
    .replaceAll(EXAMPLE.name, d.name)
    .replaceAll(`\`${EXAMPLE.folder}/\``, `\`${f}/\``)
    .replaceAll(`${EXAMPLE.folder}/<Issue`, `${f}/<Issue`)
    .replaceAll(`${EXAMPLE.folder}-<Issue`, `${f}-<Issue`)
    .replaceAll(`/${EXAMPLE.folder}\n`, `/${f}\n`);
  return withTrialNote(filled);
}

export interface TrialFile {
  /** Relative to the trial folder. */
  readonly path: string;
  readonly content: string;
}

/** Every file of a trial company with `count` departments; null when the templates moved. */
export function trialFiles(doc: string, count: number): TrialFile[] | null {
  const templates = extractTemplates(doc);
  if (templates === null) return null;
  const departments = trialDepartments(count);
  const commander = commanderClaudeMd(templates.commander, departments);
  const files: TrialFile[] = [];
  if (commander === null) return null;
  files.push({ path: 'CLAUDE.md', content: `${commander}\n` });
  for (const d of departments) {
    const content = departmentClaudeMd(templates.department, d);
    if (content === null) return null;
    files.push({ path: `${d.folder}/CLAUDE.md`, content });
  }
  files.push({ path: '.gitignore', content: '.claude/worktrees/\n' });
  return files;
}

/** Everything outside; tests pass fakes. */
export interface ScaffoldDeps {
  readonly readDoc: () => string;
  /** 'missing', 'empty' (a folder with nothing in it) or 'used' (anything else). */
  readonly dirState: (dir: string) => 'missing' | 'empty' | 'used';
  /** Creates the file and its parent folders, failing when the file already exists. */
  readonly writeNew: (path: string, content: string) => void;
  readonly out: (text: string) => void;
  readonly err: (text: string) => void;
}

/** Writes the trial company and prints its departments as JSON. 0 written, 1 not, 2 bad args. */
export function runTrialScaffold(args: readonly string[], deps: ScaffoldDeps): number {
  const parsed = parseScaffoldArgs(args);
  if (parsed === null) {
    deps.err(SCAFFOLD_USAGE);
    return 2;
  }
  if (deps.dirState(parsed.dir) === 'used') {
    deps.err('フォルダが既にあり、空ではありません。何も書きませんでした\n');
    return 1;
  }
  const files = trialFiles(deps.readDoc(), parsed.count);
  if (files === null) {
    deps.err(
      'docs/orchestration.md の雛形の形が変わっていて、埋められません。何も書きませんでした\n',
    );
    return 1;
  }
  for (const file of files) deps.writeNew(join(parsed.dir, file.path), file.content);
  const departments = TRIAL_DEPARTMENTS.slice(0, parsed.count).map((d) => ({
    name: d.name,
    label: d.label,
    folder: d.folder,
    prefix: `${d.folder}/`,
  }));
  deps.out(`${JSON.stringify({ dir: parsed.dir, departments }, null, 2)}\n`);
  return 0;
}
