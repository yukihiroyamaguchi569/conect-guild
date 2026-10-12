import { describe, expect, it } from 'vitest';
import { collectorStatusSchema } from './index.ts';

const AT = '2026-10-12T00:00:00.000Z';

describe('collectorStatusSchema', () => {
  it('accepts a success and each failure kind', () => {
    expect(collectorStatusSchema.parse({ ok: true, attemptedAt: AT })).toEqual({
      ok: true,
      attemptedAt: AT,
    });
    for (const kind of ['gh-failed', 'validation-failed', 'write-failed', 'unexpected'] as const)
      expect(collectorStatusSchema.parse({ ok: false, attemptedAt: AT, kind })).toEqual({
        ok: false,
        attemptedAt: AT,
        kind,
      });
  });

  it('accepts the positions of missing department labels (Issue #85)', () => {
    expect(
      collectorStatusSchema.parse({ ok: true, attemptedAt: AT, missingLabels: [0, 3] }),
    ).toEqual({ ok: true, attemptedAt: AT, missingLabels: [0, 3] });
    const failed = { ok: false, attemptedAt: AT, kind: 'gh-failed', missingLabels: [2] } as const;
    expect(collectorStatusSchema.parse(failed)).toEqual(failed);
  });

  it.each([
    ['no positions', []],
    ['a position past the departments', [4]],
    ['a negative position', [-1]],
    ['a fraction', [0.5]],
    ['a repeat', [1, 1]],
    ['positions out of order', [2, 1]],
    ['label names', ['経理']],
    ['no array', 1],
  ])('rejects missing labels with %s', (_label, missingLabels) => {
    expect(
      collectorStatusSchema.safeParse({ ok: true, attemptedAt: AT, missingLabels }).success,
    ).toBe(false);
  });

  it.each([
    ['an unknown kind', { ok: false, attemptedAt: AT, kind: 'auth-failed' }],
    ['a failure with no kind', { ok: false, attemptedAt: AT }],
    ['a success with a kind', { ok: true, attemptedAt: AT, kind: 'gh-failed' }],
    ['no time', { ok: true }],
    ['a time that is no ISO date-time', { ok: true, attemptedAt: 'yesterday' }],
    ['ok that is no boolean', { ok: 'true', attemptedAt: AT }],
    // Nothing else may slip in: no repository, title or path.
    ['a repository', { ok: true, attemptedAt: AT, repo: 'owner/name' }],
    ['a message', { ok: false, attemptedAt: AT, kind: 'gh-failed', message: 'HTTP 404' }],
    ['no object', 'ok'],
    ['null', null],
  ])('rejects %s', (_label, value) => {
    expect(collectorStatusSchema.safeParse(value).success).toBe(false);
  });
});
