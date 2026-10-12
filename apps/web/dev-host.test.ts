import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import config from './vite.config.ts';

const scriptsSchema = z.object({ scripts: z.object({ dev: z.string() }) });

function devScript(path: string): string {
  const json: unknown = JSON.parse(readFileSync(path, 'utf8'));
  return scriptsSchema.parse(json).scripts.dev;
}

// Issue #82: the dev server must stay on 127.0.0.1 even when vite.config.ts is not read.
describe('dev server host', () => {
  it('is pinned in vite.config.ts', () => {
    expect(config.server?.host).toBe('127.0.0.1');
  });

  it('is pinned on the command line, so a missed config cannot fall back to localhost', () => {
    expect(devScript(join(import.meta.dirname, 'package.json'))).toBe('vite --host 127.0.0.1');
  });

  it('passes the root `npm run dev -- <args>` through to vite instead of to npm', () => {
    expect(devScript(join(import.meta.dirname, '../../package.json'))).toBe(
      'npm run dev -w apps/web --',
    );
  });
});
