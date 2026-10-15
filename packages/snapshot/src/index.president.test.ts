import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { snapshotSchema } from './index.ts';

/** Issue #141: the king's quests of a snapshot, optional with the same schemaVersion. */

const samplePath = new URL('../../../apps/web/public/snapshot.sample.json', import.meta.url);

function sample(): Record<string, unknown> {
  const value: unknown = JSON.parse(readFileSync(samplePath, 'utf8'));
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('sample is not an object');
  }
  return { ...value };
}

const T = '2026-10-12T00:00:00.000Z';
const ISSUE = { number: 7, title: '架空の勅命', updatedAt: T };

function withPresident(president: unknown) {
  return snapshotSchema.safeParse({ ...sample(), president });
}

describe('snapshotSchema: president', () => {
  it('reads a snapshot without president (an older collector)', () => {
    const parsed = snapshotSchema.parse(sample());
    expect(parsed.president).toBeUndefined();
  });

  it('accepts the king’s open Issues, none included', () => {
    expect(withPresident({ issues: [] }).success).toBe(true);
    const parsed = withPresident({ issues: [ISSUE, { ...ISSUE, number: 8 }] });
    expect(parsed.data?.president?.issues.map((issue) => issue.number)).toEqual([7, 8]);
  });

  it.each([
    ['a repeated number', { issues: [ISSUE, ISSUE] }],
    ['labels', { issues: [{ ...ISSUE, labels: ['社長'] }] }],
    ['a body', { issues: [{ ...ISSUE, body: 'secret' }] }],
    ['a missing updatedAt', { issues: [{ number: 7, title: 't' }] }],
    ['an unknown key', { issues: [], label: '社長' }],
  ])('rejects %s', (_label, president) => {
    expect(withPresident(president).success).toBe(false);
  });
});
