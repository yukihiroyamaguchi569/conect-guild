import { describe, expect, it, vi } from 'vitest';
import {
  createSnapshotMiddleware,
  snapshotPlugin,
  type ReadSnapshotFile,
  type SnapshotResponse,
} from './vite-plugin-snapshot.ts';

const FILE_PATH = '/fixed/.data/snapshot.json';
const BODY = new TextEncoder().encode('{"schemaVersion":1}');

interface Recorded {
  statusCode: number;
  headers: Map<string, string>;
  body: string | Uint8Array | undefined;
  ended: boolean;
}

function fakeResponse(): { res: SnapshotResponse; recorded: Recorded; done: Promise<void> } {
  const recorded: Recorded = { statusCode: 0, headers: new Map(), body: undefined, ended: false };
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
      recorded.ended = true;
      resolveDone();
    },
  };
  return { res, recorded, done };
}

function enoent(): Error {
  return Object.assign(new Error('missing'), { code: 'ENOENT' });
}

async function request(
  method: string | undefined,
  url: string | undefined,
  readSnapshotFile: ReadSnapshotFile,
) {
  const middleware = createSnapshotMiddleware(FILE_PATH, readSnapshotFile);
  const { res, recorded, done } = fakeResponse();
  const next = vi.fn();
  middleware({ method, url }, res, next);
  if (next.mock.calls.length === 0) await done;
  return { recorded, next };
}

describe('createSnapshotMiddleware: serving the file', () => {
  it('serves the fixed file on GET with no-store and JSON content type', async () => {
    const read = vi.fn<ReadSnapshotFile>().mockResolvedValue(BODY);
    const { recorded, next } = await request('GET', '/snapshot.json', read);
    expect(next).not.toHaveBeenCalled();
    expect(read).toHaveBeenCalledExactlyOnceWith(FILE_PATH);
    expect(recorded.statusCode).toBe(200);
    expect(recorded.headers.get('cache-control')).toBe('no-store');
    expect(recorded.headers.get('content-type')).toBe('application/json; charset=utf-8');
    expect(recorded.headers.get('content-length')).toBe(String(BODY.byteLength));
    expect(recorded.body).toBe(BODY);
  });

  it('ignores the query string and still reads the same fixed path', async () => {
    const read = vi.fn<ReadSnapshotFile>().mockResolvedValue(BODY);
    const { recorded } = await request('GET', '/snapshot.json?path=../../etc/passwd', read);
    expect(recorded.statusCode).toBe(200);
    expect(read).toHaveBeenCalledExactlyOnceWith(FILE_PATH);
  });

  it('answers HEAD with headers and no body', async () => {
    const read = vi.fn<ReadSnapshotFile>().mockResolvedValue(BODY);
    const { recorded } = await request('HEAD', '/snapshot.json', read);
    expect(recorded.statusCode).toBe(200);
    expect(recorded.headers.get('cache-control')).toBe('no-store');
    expect(recorded.body).toBeUndefined();
  });

  it('returns 204 with no-store and no body when the file does not exist yet (Issue #67)', async () => {
    const read = vi.fn<ReadSnapshotFile>().mockRejectedValue(enoent());
    const { recorded } = await request('GET', '/snapshot.json', read);
    expect(recorded.statusCode).toBe(204);
    expect(recorded.headers.has('content-type')).toBe(false);
    expect(recorded.headers.get('cache-control')).toBe('no-store');
    expect(recorded.body).toBeUndefined();
  });

  it('returns 500 without a body for other read errors', async () => {
    const read = vi.fn<ReadSnapshotFile>().mockRejectedValue(new Error('EACCES'));
    const { recorded } = await request('GET', '/snapshot.json', read);
    expect(recorded.statusCode).toBe(500);
    expect(recorded.body).toBeUndefined();
  });
});

describe('createSnapshotMiddleware: methods and routes', () => {
  it.each(['POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'])(
    'rejects %s with 405 and never reads the file',
    async (method) => {
      const read = vi.fn<ReadSnapshotFile>().mockResolvedValue(BODY);
      const { recorded } = await request(method, '/snapshot.json', read);
      expect(recorded.statusCode).toBe(405);
      expect(recorded.headers.get('allow')).toBe('GET, HEAD');
      expect(read).not.toHaveBeenCalled();
    },
  );

  it('rejects a missing method with 405', async () => {
    const read = vi.fn<ReadSnapshotFile>().mockResolvedValue(BODY);
    const { recorded } = await request(undefined, '/snapshot.json', read);
    expect(recorded.statusCode).toBe(405);
    expect(read).not.toHaveBeenCalled();
  });

  it.each([
    '/',
    '/snapshot.sample.json',
    '/.data/snapshot.json',
    '/snapshot.json/extra',
    '/sub/snapshot.json',
    undefined,
  ])('passes %s to the next middleware without reading', async (url) => {
    const read = vi.fn<ReadSnapshotFile>().mockResolvedValue(BODY);
    const { recorded, next } = await request('GET', url, read);
    expect(next).toHaveBeenCalledOnce();
    expect(recorded.ended).toBe(false);
    expect(read).not.toHaveBeenCalled();
  });
});

describe('snapshotPlugin', () => {
  it('applies to the dev server only', () => {
    const plugin = snapshotPlugin();
    expect(plugin.apply).toBe('serve');
    expect(plugin.name).toBe('conect-guild:snapshot');
  });
});
