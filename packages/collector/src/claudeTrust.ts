import { dirname, join } from 'node:path';
import { z } from 'zod';

/**
 * Issue #294: whether Claude Code already trusts a folder, read from its `.claude.json`. Pure: the
 * file's text is handed in. Read only; nothing here writes the file. Only `projects[<path>]
 * .hasTrustDialogAccepted` is looked at; the rest of the file is not kept or shown.
 */

/** `unknown`: the file is missing, unreadable, not JSON or not of the expected shape. */
export type FolderTrust = 'trusted' | 'untrusted' | 'unknown';

/** Where Claude Code keeps it: `$CLAUDE_CONFIG_DIR/.claude.json`, else `~/.claude.json`. */
export function claudeConfigPath(configDirEnv: string | undefined, home: string): string {
  const dir = configDirEnv === undefined || configDirEnv === '' ? home : configDirEnv;
  return join(dir, '.claude.json');
}

const configSchema = z.object({ projects: z.record(z.string(), z.unknown()) });
const entrySchema = z.object({ hasTrustDialogAccepted: z.boolean().optional() });

/** The folder and each of its parents, up to the root. */
function selfAndParents(folder: string): string[] {
  const paths = [folder];
  for (let p = folder; dirname(p) !== p; p = dirname(p)) paths.push(dirname(p));
  return paths;
}

/**
 * Trusted when the folder (absolute) or one of its parents has accepted the trust dialog. Unknown
 * when the entry of one of them is not an object with an optional boolean; other folders' entries
 * are not looked at.
 */
export function folderTrust(configText: string | null, folder: string): FolderTrust {
  if (configText === null) return 'unknown';
  let json: unknown;
  try {
    json = JSON.parse(configText);
  } catch {
    return 'unknown';
  }
  const parsed = configSchema.safeParse(json);
  if (!parsed.success) return 'unknown';
  const { projects } = parsed.data;
  const entries = selfAndParents(folder)
    .filter((path) => Object.hasOwn(projects, path))
    .map((path) => entrySchema.safeParse(projects[path]));
  // An entry of the folder or a parent in another shape: the file is not what we know.
  if (entries.some((e) => !e.success)) return 'unknown';
  return entries.some((e) => e.data?.hasTrustDialogAccepted === true) ? 'trusted' : 'untrusted';
}
