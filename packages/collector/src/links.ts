// A reference is `#123` or `owner/name#123`, not glued to a preceding word.
const REF = String.raw`(?<![\w./#-])(?:([\w.-]+)\/([\w.-]+))?#(\d+)\b`;
// GitHub's closing keywords: close(s|d), fix(es|ed), resolve(s|d), optional colon.
const CLOSING = String.raw`\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?):?\s+`;

interface IssueRef {
  readonly owner: string | undefined;
  readonly name: string | undefined;
  readonly number: number;
}

function refsIn(text: string, pattern: RegExp): IssueRef[] {
  return [...text.matchAll(pattern)].map((match) => ({
    owner: match[1],
    name: match[2],
    number: Number(match[3]),
  }));
}

function sameRepoNumbers(
  refs: readonly IssueRef[],
  repo: string,
  existingIssues: ReadonlySet<number>,
): number[] {
  const target = repo.toLowerCase();
  const numbers = refs
    .filter(
      (ref) => ref.owner === undefined || `${ref.owner}/${ref.name ?? ''}`.toLowerCase() === target,
    )
    .map((ref) => ref.number)
    .filter((n) => existingIssues.has(n));
  return [...new Set(numbers)].toSorted((a, b) => a - b);
}

/**
 * Issue numbers a PR points at, taken from its title and body.
 * Only references to `repo` that name an Issue in `existingIssues` count, as GitHub links only
 * those (a `#99999999999999999999` in a body must not stop the collector). If any closing keyword
 * reference exists, only those are used.
 */
export function extractLinkedIssues(
  title: string,
  body: string | null,
  repo: string,
  existingIssues: ReadonlySet<number>,
): number[] {
  const text = `${title}\n${body ?? ''}`;
  const closingRefs = refsIn(text, new RegExp(CLOSING + REF, 'gi'));
  const closing = sameRepoNumbers(closingRefs, repo, existingIssues);
  if (closing.length > 0) return closing;
  return sameRepoNumbers(refsIn(text, new RegExp(REF, 'g')), repo, existingIssues);
}
