import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Plugin } from 'vite';

/** The only URL this plugin answers. */
const SNAPSHOT_ROUTE = '/snapshot.json';

/** Where the collector writes the real data, relative to the web app root (docs/DESIGN.md 4.1). */
const SNAPSHOT_DATA_DIR = '.data';
const SNAPSHOT_FILE_NAME = 'snapshot.json';

/** The parts of node's IncomingMessage the middleware reads. */
export interface SnapshotRequest {
  readonly method?: string;
  readonly url?: string;
}

/** The parts of node's ServerResponse the middleware writes. */
export interface SnapshotResponse {
  statusCode: number;
  setHeader(name: string, value: string): unknown;
  end(body?: string | Uint8Array): unknown;
}

export type ReadSnapshotFile = (filePath: string) => Promise<Uint8Array>;

function pathnameOf(url: string | undefined): string | null {
  if (url === undefined) return null;
  try {
    return new URL(url, 'http://127.0.0.1').pathname;
  } catch {
    return null;
  }
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

function sendStatus(res: SnapshotResponse, statusCode: number): void {
  res.statusCode = statusCode;
  res.setHeader('Cache-Control', 'no-store');
  res.end();
}

async function serveSnapshot(
  req: SnapshotRequest,
  res: SnapshotResponse,
  filePath: string,
  readSnapshotFile: ReadSnapshotFile,
): Promise<void> {
  let body: Uint8Array;
  try {
    body = await readSnapshotFile(filePath);
  } catch (error) {
    // No file yet: the collector has never run. 204, not 404, so the browser logs no error on
    // every 5-second read while the page plays the demo instead (Issue #67).
    sendStatus(res, isMissingFile(error) ? 204 : 500);
    return;
  }
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Length', String(body.byteLength));
  res.end(req.method === 'HEAD' ? undefined : body);
}

/**
 * Connect-style middleware that answers GET/HEAD /snapshot.json from a fixed file.
 * The file path never depends on the request.
 */
export function createSnapshotMiddleware(
  filePath: string,
  readSnapshotFile: ReadSnapshotFile = readFile,
) {
  return (req: SnapshotRequest, res: SnapshotResponse, next: () => void): void => {
    if (pathnameOf(req.url) !== SNAPSHOT_ROUTE) {
      next();
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.setHeader('Allow', 'GET, HEAD');
      sendStatus(res, 405);
      return;
    }
    void serveSnapshot(req, res, filePath, readSnapshotFile);
  };
}

/** Dev-server-only plugin: serves apps/web/.data/snapshot.json at /snapshot.json. */
export function snapshotPlugin(): Plugin {
  return {
    name: 'conect-guild:snapshot',
    apply: 'serve',
    configureServer(server) {
      const filePath = path.join(server.config.root, SNAPSHOT_DATA_DIR, SNAPSHOT_FILE_NAME);
      server.middlewares.use(createSnapshotMiddleware(filePath));
    },
  };
}
