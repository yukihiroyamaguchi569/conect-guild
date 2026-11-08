import { execFile } from 'node:child_process';
import {
  link,
  lstat,
  mkdir,
  readdir,
  mkdtemp,
  rm,
  symlink,
  utimes,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cardsPlugin,
  createCardsMiddleware,
  listCards,
  readCard,
  type CardsFs,
} from './vite-plugin-cards.ts';
import type { SnapshotResponse } from './vite-plugin-snapshot.ts';

interface Recorded {
  statusCode: number;
  headers: Map<string, string>;
  body: string | Uint8Array | undefined;
}

function fakeResponse(): { res: SnapshotResponse; recorded: Recorded; done: Promise<void> } {
  const recorded: Recorded = { statusCode: 0, headers: new Map(), body: undefined };
  let resolveDone: () => void = () => undefined;
  const done = new Promise<void>((resolve) => {
    resolveDone = resolve;
  });
  const res: SnapshotResponse = {
    get statusCode() {
      return recorded.statusCode;
    },
    set statusCode(value: number) {
      recorded.statusCode = value;
    },
    setHeader(name, value) {
      recorded.headers.set(name.toLowerCase(), value);
    },
    end(body) {
      recorded.body = body;
      resolveDone();
    },
  };
  return { res, recorded, done };
}

let root = '';
let cards = '';
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
const SECRET = new TextEncoder().encode('outside the cards folder');

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'cards-'));
  cards = path.join(root, 'cards');
  await mkdir(cards);
  await writeFile(path.join(root, 'snapshot.json'), SECRET);
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function request(url: string, method = 'GET', dir = cards) {
  const { res, recorded, done } = fakeResponse();
  const next = vi.fn();
  createCardsMiddleware(dir)({ method, url }, res, next);
  if (next.mock.calls.length === 0) await done;
  return { recorded, next };
}

function text(body: Recorded['body']): string {
  return typeof body === 'string' ? body : new TextDecoder().decode(body);
}

describe('listCards', () => {
  it('lists only regular <number>.png files, sorted, with their times', async () => {
    await writeFile(path.join(cards, '12.png'), PNG);
    await writeFile(path.join(cards, '3.png'), PNG);
    await writeFile(path.join(cards, '3.txt'), 'description');
    await writeFile(path.join(cards, '012.png'), PNG);
    await writeFile(path.join(cards, 'a.png'), PNG);
    await mkdir(path.join(cards, '7.png'));
    await symlink(path.join(root, 'snapshot.json'), path.join(cards, '8.png'));
    await utimes(path.join(cards, '3.png'), 1_700_000_000, 1_700_000_000);
    const listed = await listCards(cards);
    expect(listed.map((card) => card.number)).toEqual([3, 12]);
    expect(listed[0]?.updatedAt).toBe(1_700_000_000_000);
  });

  it('is empty when there is no folder', async () => {
    expect(await listCards(path.join(root, 'missing'))).toEqual([]);
  });

  it('is empty when the folder is a link to another folder', async () => {
    await writeFile(path.join(cards, '5.png'), PNG);
    const linked = path.join(root, 'linked');
    await symlink(cards, linked);
    expect(await listCards(linked)).toEqual([]);
  });
});

describe('readCard', () => {
  it('reads a regular picture', async () => {
    await writeFile(path.join(cards, '5.png'), PNG);
    expect(await readCard(cards, 5)).toEqual(Buffer.from(PNG));
  });

  it('refuses a link, a folder and a missing file', async () => {
    await symlink(path.join(root, 'snapshot.json'), path.join(cards, '8.png'));
    await mkdir(path.join(cards, '7.png'));
    expect(await readCard(cards, 8)).toBeNull();
    expect(await readCard(cards, 7)).toBeNull();
    expect(await readCard(cards, 9)).toBeNull();
  });

  it('refuses a folder that is a link', async () => {
    await writeFile(path.join(cards, '5.png'), PNG);
    const linked = path.join(root, 'linked');
    await symlink(cards, linked);
    expect(await readCard(linked, 5)).toBeNull();
  });
});

describe('createCardsMiddleware', () => {
  it('serves the index as JSON with no-store, and an empty one without a folder', async () => {
    await writeFile(path.join(cards, '101.png'), PNG);
    const { recorded } = await request('/cards/index.json?x=1');
    expect(recorded.statusCode).toBe(200);
    expect(recorded.headers.get('cache-control')).toBe('no-store');
    expect(recorded.headers.get('content-type')).toBe('application/json; charset=utf-8');
    const body: unknown = JSON.parse(text(recorded.body));
    const updatedAt = (await listCards(cards))[0]?.updatedAt;
    expect(body).toEqual({ cards: [{ number: 101, updatedAt }] });

    const empty = await request('/cards/index.json', 'GET', path.join(root, 'missing'));
    expect(empty.recorded.statusCode).toBe(200);
    expect(JSON.parse(text(empty.recorded.body))).toEqual({ cards: [] });
  });

  it('serves a picture as image/png with no-store, ignoring the query', async () => {
    await writeFile(path.join(cards, '101.png'), PNG);
    const { recorded } = await request('/cards/101.png?v=123');
    expect(recorded.statusCode).toBe(200);
    expect(recorded.headers.get('content-type')).toBe('image/png');
    expect(recorded.headers.get('cache-control')).toBe('no-store');
    expect(recorded.body).toEqual(Buffer.from(PNG));
  });

  it('sends no body for HEAD', async () => {
    await writeFile(path.join(cards, '101.png'), PNG);
    const { recorded } = await request('/cards/101.png', 'HEAD');
    expect(recorded.statusCode).toBe(200);
    expect(recorded.headers.get('content-length')).toBe(String(PNG.byteLength));
    expect(recorded.body).toBeUndefined();
  });

  it.each([
    '/cards/0.png',
    '/cards/012.png',
    '/cards/1234567890.png',
    '/cards/abc.png',
    '/cards/101.txt',
    '/cards/101.PNG',
    '/cards/101.png/x',
    '/cards/%2e%2e%2fsnapshot.json',
    '/cards/..%2fsnapshot.json',
    '/cards/',
    '/cards',
    '/cards/sub/101.png',
  ])('answers 404 with no-store for %s', async (url) => {
    await writeFile(path.join(cards, '101.png'), PNG);
    const { recorded, next } = await request(url);
    expect(next).not.toHaveBeenCalled();
    expect(recorded.statusCode).toBe(404);
    expect(recorded.headers.get('cache-control')).toBe('no-store');
    expect(recorded.body).toBeUndefined();
  });

  it('answers 404 for a picture that is a link out of the folder, or missing', async () => {
    await symlink(path.join(root, 'snapshot.json'), path.join(cards, '8.png'));
    expect((await request('/cards/8.png')).recorded.statusCode).toBe(404);
    expect((await request('/cards/9.png')).recorded.statusCode).toBe(404);
  });
});

describe('createCardsMiddleware refusals', () => {
  it('answers 405 for other methods', async () => {
    const { recorded } = await request('/cards/index.json', 'POST');
    expect(recorded.statusCode).toBe(405);
    expect(recorded.headers.get('allow')).toBe('GET, HEAD');
    expect(recorded.headers.get('cache-control')).toBe('no-store');
  });

  it.each(['/', '/snapshot.json', '/cardsx', '/src/assets/card/back.png'])(
    'passes %s on',
    async (url) => {
      const { next } = await request(url);
      expect(next).toHaveBeenCalledOnce();
    },
  );
});

describe('cardsPlugin', () => {
  it('only applies to the dev server', () => {
    expect(cardsPlugin().apply).toBe('serve');
  });
});

describe('files outside the cards folder (codex review)', () => {
  it('refuses a cards folder under a .data that is a link', async () => {
    const real = path.join(root, 'real-data');
    await mkdir(path.join(real, 'cards'), { recursive: true });
    await writeFile(path.join(real, 'cards', '5.png'), PNG);
    await symlink(real, path.join(root, 'data'));
    const dir = path.join(root, 'data', 'cards');
    expect(await listCards(dir)).toEqual([]);
    expect(await readCard(dir, 5)).toBeNull();
    expect((await request('/cards/5.png', 'GET', dir)).recorded.statusCode).toBe(404);
  });

  it('refuses a hard link to a file kept elsewhere', async () => {
    await link(path.join(root, 'snapshot.json'), path.join(cards, '9.png'));
    expect(await listCards(cards)).toEqual([]);
    expect(await readCard(cards, 9)).toBeNull();
  });

  it('refuses a FIFO without waiting for a writer', async () => {
    await promisify(execFile)('mkfifo', [path.join(cards, '6.png')]);
    expect(await listCards(cards)).toEqual([]);
    expect(await readCard(cards, 6)).toBeNull();
  });

  it('skips a picture removed or replaced by a link while the folder is listed', async () => {
    await writeFile(path.join(cards, '1.png'), PNG);
    await writeFile(path.join(cards, '2.png'), PNG);
    await writeFile(path.join(cards, '3.png'), PNG);
    await symlink(path.join(root, 'snapshot.json'), path.join(root, 'a-link'));
    const fs: CardsFs = {
      readdir: realReaddir,
      lstat: (file) => {
        if (file.endsWith('1.png')) return Promise.reject(enoent());
        return lstat(file.endsWith('2.png') ? path.join(root, 'a-link') : file);
      },
    };
    expect((await listCards(cards, fs)).map((card) => card.number)).toEqual([3]);
  });

  it('refuses a picture whose name no longer is the file opened', async () => {
    await writeFile(path.join(cards, '5.png'), PNG);
    await writeFile(path.join(cards, '4.png'), PNG);
    const fs: CardsFs = {
      readdir: realReaddir,
      lstat: (file) => lstat(file.endsWith('5.png') ? path.join(cards, '4.png') : file),
    };
    expect(await readCard(cards, 5, fs)).toBeNull();
    expect(await readCard(cards, 4, fs)).toEqual(Buffer.from(PNG));
  });

  it('lists nothing when the folder goes away while it is listed', async () => {
    await writeFile(path.join(cards, '5.png'), PNG);
    const fs: CardsFs = { lstat, readdir: () => Promise.reject(enoent()) };
    expect(await listCards(cards, fs)).toEqual([]);
  });

  it('keeps every /cards answer to its own origin', async () => {
    await writeFile(path.join(cards, '5.png'), PNG);
    for (const url of ['/cards/5.png', '/cards/index.json', '/cards/7.png', '/cards/x']) {
      const { recorded } = await request(url);
      expect(recorded.headers.get('cross-origin-resource-policy')).toBe('same-origin');
    }
  });
});

function realReaddir(dir: string) {
  return readdir(dir, { withFileTypes: true });
}

function enoent(): Error {
  return Object.assign(new Error('missing'), { code: 'ENOENT' });
}
