import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { SETTINGS_ROOT } from '@conect-guild/snapshot/settingsFile';
import { runTrialScaffold } from './trialScaffold.ts';

// Issue #107: `npm run trial:scaffold`. Reads the templates from this repository's
// docs/orchestration.md and writes only under the folder given with --dir.

function dirState(dir: string): 'missing' | 'empty' | 'used' {
  const stat = statSync(dir, { throwIfNoEntry: false });
  if (stat === undefined) return 'missing';
  return stat.isDirectory() && readdirSync(dir).length === 0 ? 'empty' : 'used';
}

process.exitCode = runTrialScaffold(process.argv.slice(2), {
  readDoc: () => readFileSync(join(SETTINGS_ROOT, 'docs', 'orchestration.md'), 'utf8'),
  dirState,
  writeNew: (path, content) => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content, { flag: 'wx' });
  },
  out: (text) => {
    process.stdout.write(text);
  },
  err: (text) => {
    process.stderr.write(text);
  },
});
