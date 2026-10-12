import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const run = promisify(execFile);
const HOOK_URL = new URL('./settingsHook.ts', import.meta.url).href;
const SETTINGS_URL = new URL('../../snapshot/src/settings.ts', import.meta.url).href;

let root = '';

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'guild-settings-'));
  await writeFile(join(root, 'guild.settings.ts'), "export const NAME = 'default';\n");
  await writeFile(join(root, 'guild.settings.local.ts'), "export const NAME = 'local';\n");
  // Stands in for packages/snapshot/src/settings.ts: imports the default file by its path.
  await writeFile(
    join(root, 'reader.ts'),
    "import { NAME } from './guild.settings.ts';\nconsole.log(NAME);\n",
  );
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

/** Runs `useSettingsFile(file, root)` in a fresh node, then imports the reader. */
async function readThrough(fileName: string, reader = 'reader.ts'): Promise<string> {
  const readerUrl = pathToFileURL(join(root, reader)).href;
  const script = [
    `const { useSettingsFile } = await import(${JSON.stringify(HOOK_URL)});`,
    `useSettingsFile(${JSON.stringify({ name: fileName, path: join(root, fileName) })}, ${JSON.stringify(root)});`,
    `await import(${JSON.stringify(readerUrl)});`,
  ].join('\n');
  const { stdout } = await run(process.execPath, ['--input-type=module', '-e', script]);
  return stdout.trim();
}

describe('useSettingsFile', () => {
  it('sends the imports of guild.settings.ts to guild.settings.local.ts', async () => {
    expect(await readThrough('guild.settings.local.ts')).toBe('local');
  });

  it('leaves guild.settings.ts alone when it is the file in use', async () => {
    expect(await readThrough('guild.settings.ts')).toBe('default');
  });

  it('checks the local file against the same schema and stops when it is invalid', async () => {
    await writeFile(
      join(root, 'guild.settings.local.ts'),
      "export const GUILD_SETTINGS = { repo: 'not a repo' };\n",
    );
    await writeFile(
      join(root, 'checker.ts'),
      [
        "import { GUILD_SETTINGS } from './guild.settings.ts';",
        `import { checkGuildSettings } from ${JSON.stringify(SETTINGS_URL)};`,
        'checkGuildSettings(GUILD_SETTINGS);',
        "console.log('accepted');",
      ].join('\n'),
    );
    await expect(readThrough('guild.settings.local.ts', 'checker.ts')).rejects.toThrow(
      /guild\.settings\.local\.ts or guild\.settings\.ts[\s\S]*is invalid[\s\S]*repo/,
    );
  });
});
