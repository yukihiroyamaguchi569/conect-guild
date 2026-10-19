import { makeSettings } from '@conect-guild/snapshot/settings.fixtures';
import type { GuildSettings } from '@conect-guild/snapshot/settingsSchema';
import { TRIAL_MARK } from './trialCells.ts';
import { TRIAL_DEPARTMENTS } from './trialScaffold.ts';

// Test-only: a trial company as /guild-trial writes it, under a made-up home directory.

export const HOME = '/home/tester';
export const CLAUDE_MD = `# 司令塔\n\nこれは conect-guild を試すための${TRIAL_MARK}のものである。\n`;
const MEMBERS = ['minori', 'hibiki', 'hirame', 'sasae', 'takumi', 'musubi'] as const;

/** Settings as /guild-trial writes them, with `count` departments. */
export function trialSettings(count: number, root = '~/guild-trial/guild-trial'): GuildSettings {
  const chosen = TRIAL_DEPARTMENTS.slice(0, count);
  return makeSettings(count, {
    commanderSessionDir: root,
    departments: chosen.map((d, i) => ({
      label: d.label,
      member: MEMBERS[i] ?? 'minori',
      sessionDir: `${root}/${d.folder}`,
    })),
    branchPrefixes: chosen.map((d) => ({ prefix: `${d.folder}/`, department: d.label })),
  });
}
