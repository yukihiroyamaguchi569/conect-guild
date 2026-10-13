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

describe('collectorStatusSchema: suspected mix-ups (Issue #94)', () => {
  it('accepts the suspected mix-ups of departments (Issue #94)', () => {
    const mixups = [
      { from: 1, to: 2 },
      { from: 2, to: 1 },
    ];
    expect(
      collectorStatusSchema.parse({ ok: true, attemptedAt: AT, suspectedMixups: mixups }),
    ).toEqual({ ok: true, attemptedAt: AT, suspectedMixups: mixups });
    const failed = {
      ok: false,
      attemptedAt: AT,
      kind: 'gh-failed',
      missingLabels: [0],
      suspectedMixups: [{ from: 3, to: 0 }],
    } as const;
    expect(collectorStatusSchema.parse(failed)).toEqual(failed);
  });

  it.each([
    ['no mix-ups', []],
    ['a department mixed with itself', [{ from: 1, to: 1 }]],
    ['a position past the departments', [{ from: 4, to: 0 }]],
    ['a negative position', [{ from: 0, to: -1 }]],
    ['a fraction', [{ from: 0.5, to: 1 }]],
    [
      'two for one department',
      [
        { from: 1, to: 2 },
        { from: 1, to: 3 },
      ],
    ],
    [
      'out of order',
      [
        { from: 2, to: 1 },
        { from: 1, to: 2 },
      ],
    ],
    ['counts', [{ from: 1, to: 2, count: 3 }]],
    ['label names', [{ from: '広報', to: '企画' }]],
    ['no to', [{ from: 1 }]],
    ['no array', { from: 1, to: 2 }],
  ])('rejects suspected mix-ups with %s', (_label, suspectedMixups) => {
    expect(
      collectorStatusSchema.safeParse({ ok: true, attemptedAt: AT, suspectedMixups }).success,
    ).toBe(false);
  });
});
