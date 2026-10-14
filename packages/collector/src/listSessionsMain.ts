import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { SETTINGS_ROOT } from '@conect-guild/snapshot/settingsFile';
import { runListSessions } from './listSessions.ts';
import { mulmoTerminalFiles, readSessionDirs } from './sessionFiles.ts';

// Issue #118: `npm run settings:list-sessions`. Reads MulmoTerminal's cwd log twice, this far
// apart, so its unterminated last line (the newest session) counts once it stayed the same.
const SETTLE_MS = 300;
const HOME = homedir();

process.exitCode = await runListSessions(process.argv.slice(2), {
  root: SETTINGS_ROOT,
  home: HOME,
  exists: existsSync,
  readText: (path) => readFileSync(path, 'utf8'),
  readDirs: (excluded) =>
    readSessionDirs(mulmoTerminalFiles(HOME).cwdLogPath, excluded, () => delay(SETTLE_MS)),
  out: (output) => {
    process.stdout.write(output);
  },
});
