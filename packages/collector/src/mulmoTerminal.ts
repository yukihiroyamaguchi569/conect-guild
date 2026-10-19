import { z } from 'zod';

/**
 * Issue #223: the few MulmoTerminal endpoints `npm run trial:open-cells` uses, on this machine
 * only. The host is fixed; the port is MulmoTerminal's own MULMOTERMINAL_PORT (default 34567).
 * Answers are checked with zod and only the fields used are kept.
 */

export const DEFAULT_PORT = 34567;
export const TIMEOUT_MS = 5000;

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/** The base URL, or null when MULMOTERMINAL_PORT is set but not a port number. */
export function mulmoTerminalBase(portEnv: string | undefined): string | null {
  if (portEnv !== undefined && portEnv !== '' && !/^[1-9]\d{0,4}$/.test(portEnv)) return null;
  const port = portEnv === undefined || portEnv === '' ? DEFAULT_PORT : Number(portEnv);
  if (port > 65535) return null;
  return `http://127.0.0.1:${String(port)}`;
}

/** `unreachable` covers a refused connection and a timeout: MulmoTerminal is not answering. */
export type CallFailure = 'unreachable' | 'http' | 'bad-answer';
export type CallResult<T> = { ok: true; value: T } | { ok: false; failure: CallFailure };

interface Transport {
  readonly fetchFn: FetchLike;
  readonly timeoutMs: number;
}

async function call<T>(
  { fetchFn, timeoutMs }: Transport,
  url: string,
  init: RequestInit,
  schema: z.ZodType<T>,
): Promise<CallResult<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  try {
    let response: Response;
    try {
      response = await fetchFn(url, { ...init, signal: controller.signal });
    } catch {
      // Refused, reset or aborted by the timeout.
      return { ok: false, failure: 'unreachable' };
    }
    if (!response.ok) return { ok: false, failure: 'http' };
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      // Not JSON, or the body did not arrive before the timeout.
      return { ok: false, failure: controller.signal.aborted ? 'unreachable' : 'bad-answer' };
    }
    const parsed = schema.safeParse(body);
    return parsed.success ? { ok: true, value: parsed.data } : { ok: false, failure: 'bad-answer' };
  } finally {
    clearTimeout(timer);
  }
}

function post(body: Record<string, string>): RequestInit {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

const presetsSchema = z.object({ cwdPresets: z.array(z.object({ path: z.string() })) });

/** Spawned: `{ message, jsonData: { chatId } }`. A refusal has only `message` (often HTTP 200). */
const spawnSchema = z.object({ jsonData: z.object({ chatId: z.string().min(1) }) });

export interface MulmoTerminalClient {
  /** Adds the folder to the recent folders (moves it to the top when it is there). */
  readonly record: (path: string, label: string) => Promise<CallResult<unknown>>;
  /** Starts a Claude session in the registered folder `project` (its projectId). */
  readonly spawn: (project: string, message: string) => Promise<CallResult<unknown>>;
  /** The paths of the recent folders. */
  readonly presetPaths: () => Promise<CallResult<string[]>>;
  /** Takes the folder out of the recent folders (what the chip's × does). */
  readonly remove: (path: string) => Promise<CallResult<unknown>>;
}

export function mulmoTerminalClient(
  base: string,
  fetchFn: FetchLike,
  timeoutMs = TIMEOUT_MS,
): MulmoTerminalClient {
  const t: Transport = { fetchFn, timeoutMs };
  return {
    record: (path, label) =>
      call(t, `${base}/api/config/cwd-presets/record`, post({ path, label }), presetsSchema),
    spawn: (project, message) =>
      call(
        t,
        `${base}/api/plugin/spawnBackgroundChat`,
        post({ project, agent: 'claude', message }),
        spawnSchema,
      ),
    presetPaths: async () => {
      const got = await call(t, `${base}/api/config`, { method: 'GET' }, presetsSchema);
      return got.ok ? { ok: true, value: got.value.cwdPresets.map((p) => p.path) } : got;
    },
    remove: (path) =>
      call(t, `${base}/api/config/cwd-presets/remove`, post({ path }), presetsSchema),
  };
}
