import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { SETTINGS_ROOT } from '@conect-guild/snapshot/settingsFile';
import { mulmoTerminalBase, mulmoTerminalClient } from './mulmoTerminal.ts';
import { runTrialOpenCells } from './trialOpenCells.ts';

// Issue #223: `npm run trial:open-cells`. Talks only to MulmoTerminal on 127.0.0.1 (its own
// MULMOTERMINAL_PORT, default 34567); no argument changes where it sends.
const base = mulmoTerminalBase(process.env.MULMOTERMINAL_PORT);

process.exitCode = await runTrialOpenCells(process.argv.slice(2), {
  root: SETTINGS_ROOT,
  home: homedir(),
  exists: existsSync,
  readText: (path) => readFileSync(path, 'utf8'),
  client: base === null ? null : mulmoTerminalClient(base, fetch),
  out: (text) => {
    process.stdout.write(text);
  },
  err: (text) => {
    process.stderr.write(text);
  },
});
