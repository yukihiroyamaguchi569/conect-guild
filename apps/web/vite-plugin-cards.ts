import { constants, type Dirent, type Stats } from 'node:fs';
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

/** The request as the middleware reads it: the snapshot plugin's, with the headers. */
export interface CardsRequest extends SnapshotRequest {
  readonly headers?: Readonly<Record<string, string | string[] | undefined>>;
}

function header(req: CardsRequest, name: string): string | undefined {
  const value = req.headers?.[name];
  return Array.isArray(value) ? value.join(',') : value;
}

/**
 * True when the request comes from another origin: a page of another site, or of another port of
 * this machine (Vite's CORS lets those read the answers). The screen's own fetch and <img> are
 * same-origin; an address typed in has no Origin.
 */
function fromAnotherOrigin(req: CardsRequest): boolean {
  const site = header(req, 'sec-fetch-site');
  if (site === 'cross-site' || site === 'same-site') return true;
  const origin = header(req, 'origin');
  if (origin === undefined) return false;
  try {
    return new URL(origin).host !== header(req, 'host');
  } catch {
    return true;
  }
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
  // Another site's page may not even embed them (an <img> there would tell which exist).
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  if (body === undefined) {
    res.end();
    return;
  }
  res.setHeader('Content-Type', body.type);
  res.setHeader('Content-Length', String(body.bytes.byteLength));
  res.end(body.head ? undefined : body.bytes);
}

/** The file system calls that look at a path; tests swap them to play a change in between. */
export interface CardsFs {
  readonly lstat: (file: string) => Promise<Stats>;
  readonly readdir: (dir: string) => Promise<Dirent[]>;
}

const REAL_FS: CardsFs = { lstat, readdir: (dir) => readdir(dir, { withFileTypes: true }) };

/** No link is followed, and a FIFO does not keep the request waiting (it is refused after). */
const OPEN_FLAGS = constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK;

async function lstatOrNull(fs: CardsFs, file: string): Promise<Stats | null> {
  try {
    return await fs.lstat(file);
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return null;
    throw error;
  }
}

/**
 * True when `dir` and its parent (.data) are real folders, not links to folders elsewhere. The
 * folders above them are the project's own.
 */
async function inRealFolders(fs: CardsFs, dir: string): Promise<boolean> {
  for (const folder of [path.dirname(dir), dir]) {
    const stat = await lstatOrNull(fs, folder);
    if (stat?.isDirectory() !== true) return false;
  }
  return true;
}

/** A regular file with no other name (a hard link would be a file kept somewhere else). */
function isOwnFile(stat: Stats): boolean {
  return stat.isFile() && stat.nlink === 1;
}

/** The pictures in `dir`: own regular files named <number>.png only. None when there is no folder. */
export async function listCards(dir: string, fs: CardsFs = REAL_FS): Promise<CardIndexEntry[]> {
  if (!(await inRealFolders(fs, dir))) return [];
  let entries: Dirent[];
  try {
    entries = await fs.readdir(dir);
  } catch (error) {
    // Removed since it was checked: no pictures, as without the folder.
    if (errorCode(error) === 'ENOENT') return [];
    throw error;
  }
  const cards: CardIndexEntry[] = [];
  for (const entry of entries) {
    const match = PICTURE_FILE.exec(entry.name);
    // A Dirent of a link is not a file: links are left out.
    if (match === null || !entry.isFile()) continue;
    // Looked at again: it may have been removed or replaced since the folder was read.
    const stat = await lstatOrNull(fs, path.join(dir, entry.name));
    if (stat === null || !isOwnFile(stat)) continue;
    cards.push({ number: Number(match[1]), updatedAt: Math.trunc(stat.mtimeMs) });
  }
  return cards.toSorted((a, b) => a.number - b.number);
}

/** True when the file opened is an own file, still under `file`'s name, in real folders. */
async function isStillOpened(
  fs: CardsFs,
  dir: string,
  file: string,
  opened: Stats,
): Promise<boolean> {
  if (!isOwnFile(opened)) return false;
  const named = await lstatOrNull(fs, file);
  const same = named !== null && named.dev === opened.dev && named.ino === opened.ino;
  return same && (await inRealFolders(fs, dir));
}

/**
 * The bytes of picture `number` in `dir`; null unless it is an own regular file there. The file is
 * opened without following a link; then the folders are checked again and the name must still be
 * the file that was opened, so a folder swapped for a link while it was opened is refused.
 */
export async function readCard(
  dir: string,
  number: number,
  fs: CardsFs = REAL_FS,
): Promise<Uint8Array | null> {
  if (!(await inRealFolders(fs, dir))) return null;
  const file = path.join(dir, `${String(number)}.png`);
  let handle;
  try {
    handle = await open(file, OPEN_FLAGS);
  } catch (error) {
    const code = errorCode(error);
    // ENOENT: no picture; ELOOP: a link; EISDIR and the like: not a file.
    if (code === 'ENOENT' || code === 'ELOOP' || code === 'EISDIR') return null;
    throw error;
  }
  try {
    return (await isStillOpened(fs, dir, file, await handle.stat()))
      ? await handle.readFile()
      : null;
  } finally {
    await handle.close();
  }
}

async function answer(
  req: CardsRequest,
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
  return (req: CardsRequest, res: SnapshotResponse, next: () => void): void => {
    const route = pathnameOf(req.url);
    if (route !== '/cards' && route?.startsWith('/cards/') !== true) {
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
    if (fromAnotherOrigin(req)) {
      send(res, 403);
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
