import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { COLLECT_GUIDE_URL, MISSING_LABELS_GUIDE_URL, MIXUPS_GUIDE_URL } from './src/project.ts';

/** GitHub's heading anchor: lower case, punctuation dropped, each space turned into `-`. */
function githubAnchor(heading: string): string {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-');
}

function setupGuideAnchors(): string[] {
  const markdown = readFileSync(join(import.meta.dirname, '../../docs/setup.md'), 'utf8');
  return [...markdown.matchAll(/^#{1,6} (.+)$/gm)].map(([, heading = '']) => githubAnchor(heading));
}

function anchorOf(url: string): string {
  return decodeURIComponent(new URL(url).hash.slice(1));
}

// Issue #97: the banners' links land on a heading of docs/setup.md, not on the top of the page.
describe('the banners’ links into docs/setup.md', () => {
  it.each([
    ['集め方', COLLECT_GUIDE_URL, '2-自分のリポジトリで使う'],
    ['直し方', MISSING_LABELS_GUIDE_URL, '画面の帯に部門のラベルがリポジトリにありませんと出る'],
    [
      '取り違えの直し方',
      MIXUPS_GUIDE_URL,
      '画面の帯に部門の設定が入れ替わっているかもしれませんと出る',
    ],
  ])('%s points at a heading that exists', (_name, url, anchor) => {
    expect(anchorOf(url)).toBe(anchor);
    expect(setupGuideAnchors()).toContain(anchor);
  });
});
