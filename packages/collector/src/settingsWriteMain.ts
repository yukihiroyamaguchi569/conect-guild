import { existsSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { text } from 'node:stream/consumers';
import { SETTINGS_ROOT } from '@conect-guild/snapshot/settingsFile';
import { createGhRunner } from './gh.ts';
import { runSettingsWrite } from './settingsWrite.ts';
import { createFileExclusive, writeFileAtomic } from './write.ts';

// Issue #79: `npm run settings:write`. Writes only guild.settings.local.json (and its .bak) at the
// repository root. gh gets 30 seconds for the labels; past that the check warns and goes on.
const GH_TIMEOUT_MS = 30_000;

process.exitCode = await runSettingsWrite(process.argv.slice(2), {
  root: SETTINGS_ROOT,
  home: homedir(),
  readStdin: () => text(process.stdin),
  exists: existsSync,
  isDirectory: (path) => statSync(path, { throwIfNoEntry: false })?.isDirectory() ?? false,
  readText: (path) => readFileSync(path, 'utf8'),
  gh: createGhRunner(AbortSignal.timeout(GH_TIMEOUT_MS)),
  writeFile: writeFileAtomic,
  createFile: createFileExclusive,
  out: (output) => {
    process.stdout.write(output);
  },
});
