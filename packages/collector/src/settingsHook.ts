import { realpathSync } from 'node:fs';
import { registerHooks, type ResolveHookSync } from 'node:module';
import { pathToFileURL } from 'node:url';
import {
  DEFAULT_SETTINGS_FILE,
  defaultSettingsFile,
  type SettingsFile,
} from '@conect-guild/snapshot/settingsFile';

/**
 * A resolve hook that sends every import of the module at `from` to the module at `to`. Node
 * resolves modules to their real paths, so `from` is compared by its real path too.
 */
export function redirectModule(from: string, to: string): ResolveHookSync {
  const fromUrl = pathToFileURL(realpathSync(from)).href;
  const toUrl = pathToFileURL(to).href;
  return (specifier, context, nextResolve) => {
    const resolved = nextResolve(specifier, context);
    return resolved.url === fromUrl ? { ...resolved, url: toUrl } : resolved;
  };
}

/**
 * Makes the settings module (packages/snapshot/src/settings.ts) read `file` in place of
 * guild.settings.json. Must run before anything imports the settings: the module graph is resolved
 * when it is first imported, so the collector imports the rest of itself after this.
 */
export function useSettingsFile(file: SettingsFile, root: string): void {
  if (file.name === DEFAULT_SETTINGS_FILE) return;
  registerHooks({ resolve: redirectModule(defaultSettingsFile(root).path, file.path) });
}
