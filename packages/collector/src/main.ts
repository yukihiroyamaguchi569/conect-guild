import { existsSync, readFileSync } from 'node:fs';
import { loadSettingsFile, SETTINGS_ROOT } from '@conect-guild/snapshot/settingsFile';
import { useSettingsFile } from './settingsHook.ts';

// guild.settings.local.json when it exists, else guild.settings.json (docs/DESIGN.md 4.1), read
// as JSON and checked here, before the collector is imported (the settings module reads the same
// file on import). An old guild.settings.local.ts or an invalid file stops it with a message.
const loaded = (() => {
  try {
    return loadSettingsFile(SETTINGS_ROOT, {
      exists: existsSync,
      readText: (path) => readFileSync(path, 'utf8'),
    });
  } catch (error) {
    console.error(`[collector] ${error instanceof Error ? error.message : 'settings unreadable'}`);
    return null;
  }
})();
if (loaded === null) {
  process.exitCode = 1;
} else {
  useSettingsFile(loaded.file, SETTINGS_ROOT);
  console.log(`[collector] settings: ${loaded.file.name}`);
  await import('./start.ts');
}
