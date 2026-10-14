import { join } from 'node:path';

/** `~` and `~/...` in the settings are under the home directory; other paths are absolute. */
export function expandHome(dir: string, home: string): string {
  if (dir === '~') return home;
  return dir.startsWith('~/') ? join(home, dir.slice(2)) : dir;
}

/** The reverse of {@link expandHome}: the home directory and paths under it written with `~`. */
export function contractHome(path: string, home: string): string {
  if (path === home) return '~';
  return path.startsWith(`${home}/`) ? `~/${path.slice(home.length + 1)}` : path;
}
