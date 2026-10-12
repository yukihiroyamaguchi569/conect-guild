// An integration test across the package boundary on purpose: the collector's linking rule
// (packages/collector/src/links.ts, pure and import-free) feeds the screen's assignment rule, and
// Issue #73 is about what the two do together. The domain's own tests stay in party.test.ts.
import { describe, expect, it } from 'vitest';
import { extractLinkedIssues } from '../../../../packages/collector/src/links.ts';
import { assignPr, indexIssues } from './party';
import { issue, pr } from './fixtures.test-util';

describe('collector links → assignPr', () => {
  it('assigns a PR with `Closes #999` (missing) and `#7` in the title to #7 (Issue #73)', () => {
    // Before #68 the missing #999 won as the closing reference and the branch decided; now the
    // collector drops it, falls back to the plain reference #7, and #7's department takes the PR.
    const issues = indexIssues([issue(7, { labels: ['総務'] })]);
    const linkedIssues = extractLinkedIssues('Fix (#7)', 'Closes #999', 'o/r', new Set([7]));
    expect(linkedIssues).toEqual([7]);
    expect(assignPr(pr(1, { linkedIssues, headRef: 'planning/x' }), issues)).toEqual({
      department: '総務',
      source: 'linked-issue',
    });
    expect(assignPr(pr(1, { linkedIssues: [999], headRef: 'planning/x' }), issues).department).toBe(
      '企画',
    );
  });
});
