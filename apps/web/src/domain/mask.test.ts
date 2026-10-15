import { describe, expect, it } from 'vitest';
import { MASK_CHAR, maskTitle } from './mask';

describe('maskTitle (Issue #144)', () => {
  it.each([
    ['', 4],
    ['短い', 4],
    ['四文字だ', 4],
    ['五文字です', 5],
    ['架空の依頼 98', 8],
    ['架空商事への請求書を作る', 8],
    ['a'.repeat(200), 8],
  ])('rounds the length of %j into 4 to 8', (title, length) => {
    expect(maskTitle(title)).toBe(MASK_CHAR.repeat(length));
  });

  it('counts a character, not a UTF-16 unit or a code point', () => {
    // Five emoji, one of them a family of four people joined into one character.
    expect(maskTitle('🍣🍣🍣🍣👨‍👩‍👧‍👦')).toBe(MASK_CHAR.repeat(5));
  });

  it('leaves nothing of the title', () => {
    const title = '取引先A社との契約 #12「秘密」';
    const masked = maskTitle(title);
    expect(masked).toMatch(/^＊{4,8}$/u);
    for (const char of title) expect(masked).not.toContain(char);
  });
});
