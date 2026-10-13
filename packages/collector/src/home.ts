import { join } from 'node:path';

/** `~` and `~/...` in the settings are under the home directory; other paths are absolute. */
export function expandHome(dir: string, home: string): string {
  if (dir === '~') return home;
  return dir.startsWith('~/') ? join(home, dir.slice(2)) : dir;
}
