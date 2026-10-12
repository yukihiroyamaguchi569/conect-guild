import { existsSync } from 'node:fs';
import { chooseSettingsFile, SETTINGS_ROOT } from '@conect-guild/snapshot/settingsFile';
import { useSettingsFile } from './settingsHook.ts';

// guild.settings.local.ts when it exists, else guild.settings.ts (docs/DESIGN.md 4.1). Chosen
// before the collector is imported, since the settings are read and checked on import.
const settingsFile = chooseSettingsFile(SETTINGS_ROOT, existsSync);
useSettingsFile(settingsFile, SETTINGS_ROOT);
console.log(`[collector] settings: ${settingsFile.name}`);
await import('./start.ts');
