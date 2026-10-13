import {
  MIXUP_WINDOW_MS,
  departmentPositionsOf,
  mixupFindings,
  suspectedMixups,
  type Mixup,
  type MixupPr,
} from '@conect-guild/snapshot/mixup';
import { departmentFromBranch, type BranchPrefixRule } from '@conect-guild/snapshot/settings';
import { issueNumbersOf } from './build.ts';
import type { RawIssue, RawPr } from './github.ts';
import { extractLinkedIssues } from './links.ts';

/**
 * Issue #94: the merged PRs as the mix-up check sees them. The branch name becomes a department
 * position and each tied Issue its department positions here; names and titles go no further.
 */
export function toMixupPrs(
  rawIssues: readonly RawIssue[],
  rawPrs: readonly RawPr[],
  repo: string,
  context: {
    readonly branchPrefixes: readonly BranchPrefixRule[];
    readonly departments: readonly string[];
  },
): MixupPr[] {
  const { branchPrefixes, departments } = context;
  // The copy read last of an item read twice is the newest (build.ts).
  const issues = new Map(
    rawIssues.filter((issue) => !issue.is_pull_request).map((issue) => [issue.number, issue]),
  );
  const prs = [...new Map(rawPrs.map((pr) => [pr.number, pr])).values()];
  const existingIssues = issueNumbersOf(rawIssues);
  return prs.flatMap((pr) => {
    if (pr.merged_at === null) return [];
    const branchDepartment = departmentFromBranch(pr.head_ref, branchPrefixes);
    const position = branchDepartment === null ? -1 : departments.indexOf(branchDepartment);
    const linked = extractLinkedIssues(pr.title, pr.body, repo, existingIssues);
    return [
      {
        branchPosition: position === -1 ? null : position,
        mergedAt: Date.parse(pr.merged_at),
        linkedIssuePositions: linked.map((number) =>
          departmentPositionsOf(issues.get(number)?.labels ?? [], departments),
        ),
      },
    ];
  });
}

/** The suspected mix-ups among the PRs merged in the 30 days before `now`. */
export function mixupsOf(
  rawIssues: readonly RawIssue[],
  rawPrs: readonly RawPr[],
  repo: string,
  context: {
    readonly branchPrefixes: readonly BranchPrefixRule[];
    readonly departments: readonly string[];
    readonly now: Date;
  },
): Mixup[] {
  const prs = toMixupPrs(rawIssues, rawPrs, repo, context);
  return suspectedMixups(prs, context.departments.length, context.now.getTime());
}

const DAYS = String(MIXUP_WINDOW_MS / (24 * 60 * 60 * 1000));

const MIXUPS_NEXT_STEP =
  '次にやること: 設定（guild.settings.local.json、無ければ guild.settings.json）の branchPrefixes の department が、その接頭辞のブランチを作る部門のラベルになっているか確かめてください。合っていれば、部門のフォルダの CLAUDE.md が指示するラベルと接頭辞を確かめてください（docs/setup.md の「困ったとき」）';

function at(i: number): string {
  return `departments[${String(i)}]`;
}

function share(mixup: Mixup | undefined): string {
  return mixup === undefined ? '?' : `${String(mixup.count)}/${String(mixup.total)}`;
}

/**
 * The log lines of a finding: positions and counts only (never a label name, title or branch
 * name). Nothing found reads `mixups ok`.
 */
export function mixupReport(mixups: readonly Mixup[]): {
  readonly level: 'log' | 'error';
  readonly lines: readonly string[];
} {
  if (mixups.length === 0) return { level: 'log', lines: ['mixups ok'] };
  const of = (from: number): Mixup | undefined => mixups.find((m) => m.from === from);
  const lines = mixupFindings(mixups).map((finding) =>
    finding.kind === 'swap'
      ? `mixups suspected: ${at(finding.a)} と ${at(finding.b)} が入れ替わっているかもしれない` +
        `（直近 ${DAYS} 日のマージ: ${at(finding.a)} の接頭辞の PR ${share(of(finding.a))} 件が ${at(finding.b)} のラベルの Issue、` +
        `${at(finding.b)} の接頭辞の PR ${share(of(finding.b))} 件が ${at(finding.a)} のラベルの Issue）`
      : `mixups suspected: ${at(finding.from)} の接頭辞の PR ${share(of(finding.from))} 件が ${at(finding.to)} のラベルの Issue に結び付いている（直近 ${DAYS} 日のマージ）`,
  );
  return { level: 'error', lines: [...lines, MIXUPS_NEXT_STEP] };
}
