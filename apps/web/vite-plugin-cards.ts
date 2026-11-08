import { constants } from 'node:fs';
import { lstat, open, readdir } from 'node:fs/promises';
import path from 'node:path';
import type { Plugin } from 'vite';
import type { SnapshotRequest, SnapshotResponse } from './vite-plugin-snapshot.ts';

/**
 * Issue #271: the pictures of the quest cards, drawn per Issue by the /guild-card-art skill into
 * apps/web/.data/cards/<number>.png. Dev server only, like the snapshot (vite-plugin-snapshot.ts):
 * - GET /cards/index.json: the numbers that have a picture, with the file's time (to bust caches)
 * - GET /cards/<number>.png: that picture
 * Only a number is taken from the request; a link, a folder or anything else is not served.
 */

const INDEX_ROUTE = '/cards/index.json';
const PICTURE_ROUTE = /^\/cards\/([1-9]\d{0,8})\.png$/;
const PICTURE_FILE = /^([1-9]\d{0,8})\.png$/;
const CARDS_DIR = path.join('.data', 'cards');

export interface CardIndexEntry {
  readonly number: number;
  /** The file's modification time, ms since the epoch. */
  readonly updatedAt: number;
}

function pathnameOf(url: string | undefined): string | null {
  if (url === undefined) return null;
  try {
    return new URL(url, 'http://127.0.0.1').pathname;
  } catch {
    return null;
  }
}

function errorCode(error: unknown): unknown {
  return error instanceof Error && 'code' in error ? error.code : undefined;
}

function send(
  res: SnapshotResponse,
  statusCode: number,
  body?: { readonly type: string; readonly bytes: Uint8Array; readonly head: boolean },
): void {
  res.statusCode = statusCode;
  res.setHeader('Cache-Control', 'no-store');
  if (body === undefined) {
    res.end();
    return;
  }
  res.setHeader('Content-Type', body.type);
  res.setHeader('Content-Length', String(body.bytes.byteLength));
  res.end(body.head ? undefined : body.bytes);
}

/** True when `dir` is a real folder (not a link to one elsewhere). */
async function isRealDirectory(dir: string): Promise<boolean> {
  try {
    return (await lstat(dir)).isDirectory();
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return false;
    throw error;
  }
}

/** The pictures in `dir`: regular files named <number>.png only. None when there is no folder. */
export async function listCards(dir: string): Promise<CardIndexEntry[]> {
  if (!(await isRealDirectory(dir))) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  const cards: CardIndexEntry[] = [];
  for (const entry of entries) {
    const match = PICTURE_FILE.exec(entry.name);
    // A Dirent of a link is not a file: links are left out.
    if (match === null || !entry.isFile()) continue;
    const stat = await lstat(path.join(dir, entry.name));
    cards.push({ number: Number(match[1]), updatedAt: Math.trunc(stat.mtimeMs) });
  }
  return cards.toSorted((a, b) => a.number - b.number);
}

/**
 * The bytes of picture `number` in `dir`; null when it is not a regular file there. The file is
 * opened without following a link (O_NOFOLLOW), so a link swapped in after the check is refused.
 */
export async function readCard(dir: string, number: number): Promise<Uint8Array | null> {
  if (!(await isRealDirectory(dir))) return null;
  let handle;
  try {
    handle = await open(
      path.join(dir, `${String(number)}.png`),
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
  } catch (error) {
    const code = errorCode(error);
    // ENOENT: no picture; ELOOP: a link; EISDIR and the like: not a file.
    if (code === 'ENOENT' || code === 'ELOOP' || code === 'EISDIR') return null;
    throw error;
  }
  try {
    if (!(await handle.stat()).isFile()) return null;
    return await handle.readFile();
  } finally {
    await handle.close();
  }
}

async function answer(
  req: SnapshotRequest,
  res: SnapshotResponse,
  dir: string,
  route: string,
): Promise<void> {
  const head = req.method === 'HEAD';
  try {
    if (route === INDEX_ROUTE) {
      const bytes = new TextEncoder().encode(JSON.stringify({ cards: await listCards(dir) }));
      send(res, 200, { type: 'application/json; charset=utf-8', bytes, head });
      return;
    }
    const number = Number(PICTURE_ROUTE.exec(route)?.[1]);
    const bytes = await readCard(dir, number);
    if (bytes === null) send(res, 404);
    else send(res, 200, { type: 'image/png', bytes, head });
  } catch {
    send(res, 500);
  }
}

/** Connect-style middleware for /cards/index.json and /cards/<number>.png from `dir`. */
export function createCardsMiddleware(dir: string) {
  return (req: SnapshotRequest, res: SnapshotResponse, next: () => void): void => {
    const route = pathnameOf(req.url);
    if (route?.startsWith('/cards/') !== true) {
      next();
      return;
    }
    if (route !== INDEX_ROUTE && !PICTURE_ROUTE.test(route)) {
      send(res, 404);
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.setHeader('Allow', 'GET, HEAD');
      send(res, 405);
      return;
    }
    void answer(req, res, dir, route);
  };
}

/** Dev-server-only plugin: serves apps/web/.data/cards (Issue #271). */
export function cardsPlugin(): Plugin {
  return {
    name: 'conect-guild:cards',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(createCardsMiddleware(path.join(server.config.root, CARDS_DIR)));
    },
  };
}
