import { describe, expect, it } from 'vitest';
import { guestArtUrls } from './loadArt';

describe('guestArtUrls', () => {
  it('fetches no guest picture when the settings have no guests', () => {
    expect(guestArtUrls(0)).toEqual([]);
  });

  it('fetches the pictures of the guests of the settings only, in their order', () => {
    const [first, second] = guestArtUrls(2);
    expect(first).toMatch(/guest1/);
    expect(second).toMatch(/guest2/);
    expect(guestArtUrls(1)).toEqual([first]);
  });
});
