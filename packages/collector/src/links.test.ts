import { describe, expect, it } from 'vitest';
import { extractLinkedIssues } from './links.ts';

const REPO = 'owner/repo';
/** Issues #1-#200 exist in REPO. */
const EXISTING: ReadonlySet<number> = new Set(Array.from({ length: 200 }, (_, i) => i + 1));

describe('extractLinkedIssues', () => {
  it('picks #number from the title and body', () => {
    expect(extractLinkedIssues('Invoice draft (#101)', 'see #7 and #101', REPO, EXISTING)).toEqual([
      7, 101,
    ]);
  });

  it('accepts owner/name#number for the same repository, ignoring case', () => {
    expect(extractLinkedIssues('x', 'Owner/Repo#12', REPO, EXISTING)).toEqual([12]);
  });

  it('ignores references to another repository', () => {
    expect(
      extractLinkedIssues('x', 'other/repo#5 and owner/other#6 and #8', REPO, EXISTING),
    ).toEqual([8]);
  });

  it('uses only closing-keyword references when any exist', () => {
    expect(extractLinkedIssues('Refactor (#3)', 'Closes #4\nRelated #9', REPO, EXISTING)).toEqual([
      4,
    ]);
  });

  it.each([
    'close',
    'closes',
    'closed',
    'fix',
    'fixes',
    'fixed',
    'resolve',
    'resolves',
    'resolved',
    'CLOSES',
    'Fixes:',
  ])('treats "%s" as a closing keyword', (keyword) => {
    expect(extractLinkedIssues('#1', `${keyword} #2`, REPO, EXISTING)).toEqual([2]);
  });

  it('collects several closing references and same-repo long form after a keyword', () => {
    expect(
      extractLinkedIssues('Fixes #5', 'resolves owner/repo#6, closes #5', REPO, EXISTING),
    ).toEqual([5, 6]);
  });

  it('falls back to plain references when the closing reference is to another repository', () => {
    expect(extractLinkedIssues('x', 'Closes other/repo#4, see #9', REPO, EXISTING)).toEqual([9]);
  });

  it('ignores # glued to a word, URLs fragments and #0', () => {
    expect(extractLinkedIssues('abc#1 a/b/c#2', 'page.html#3 #0 ##4', REPO, EXISTING)).toEqual([]);
  });

  it('does not treat words that merely start with a keyword as closing', () => {
    expect(extractLinkedIssues('#1', 'prefix #2 fixture #3', REPO, EXISTING)).toEqual([1, 2, 3]);
  });

  it('handles a null body and no references', () => {
    expect(extractLinkedIssues('No refs', null, REPO, EXISTING)).toEqual([]);
  });
});

describe('extractLinkedIssues: only Issues that exist', () => {
  it('drops numbers that are not an Issue of the repository', () => {
    expect(extractLinkedIssues('#201', 'see #7, #500 and #123456', REPO, EXISTING)).toEqual([7]);
  });

  it('drops a number too large to be an Issue instead of passing it on', () => {
    expect(
      extractLinkedIssues('x', '- PR #99999999999999999999 is dropped, see #3', REPO, EXISTING),
    ).toEqual([3]);
  });

  it('falls back to plain references when the closing reference names no Issue', () => {
    expect(extractLinkedIssues('x', 'Closes #999, see #9', REPO, EXISTING)).toEqual([9]);
  });

  it('links nothing when the repository has no Issues', () => {
    expect(extractLinkedIssues('Fix #1', 'Closes #2', REPO, new Set())).toEqual([]);
  });
});
