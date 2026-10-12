/**
 * The team-specific settings in one place (conect.llc's, the default). To use conect-guild with
 * your own team, copy this file to guild.settings.local.ts (git-ignored) and rewrite the copy: the
 * collector and the dev server read the local file when it exists, while the tests keep this one.
 * Whichever is read is checked against the schema (packages/snapshot/src/settings.ts) when they
 * start; an invalid file stops them with a message. None of these values can be changed from
 * command-line arguments or environment variables (docs/DESIGN.md 4.1).
 */
import type { GuildSettingsInput } from '@conect-guild/snapshot/settings';

export const GUILD_SETTINGS = {
  /** The GitHub repository whose Issues and PRs are collected (owner/name). */
  repo: 'yukihiroyamaguchi569/conect-management',

  /**
   * Name, role and colour of each member. The ids are fixed (the sprites
   * `assets/sprites/<id>.png` are named after them): kaname is the 司令塔 at the reception,
   * yukihiro the president on the throne, the other four sit at the department desks.
   */
  members: {
    kaname: { name: 'かなめ', role: '司令塔', color: '#e0b040' },
    minori: { name: 'みのり', role: '経理', color: '#4caf50' },
    hibiki: { name: 'ひびき', role: '広報', color: '#e91e63' },
    hirame: { name: 'ひらめ', role: '企画', color: '#2196f3' },
    sasae: { name: 'ささえ', role: '総務', color: '#9c6b3f' },
    yukihiro: { name: 'ゆきひろ', role: '社長', color: '#8e44ad' },
  },

  /**
   * Where the 司令塔's session is started in MulmoTerminal. `~/...` is under the home directory.
   * Session directories must equal the path MulmoTerminal records (no trailing `/`).
   */
  commanderSessionDir: '~/conect-management',

  /**
   * The departments, in the fixed order used when an Issue has several department labels.
   * label: the GitHub label. member: who works it. sessionDir: where its session is started.
   * Exactly four for now (the seats are laid out for four; Issue #18).
   */
  departments: [
    { label: '経理', member: 'minori', sessionDir: '~/conect-management/accounting' },
    { label: '広報', member: 'hibiki', sessionDir: '~/conect-management/pr' },
    { label: '企画', member: 'hirame', sessionDir: '~/conect-management/planning' },
    { label: '総務', member: 'sasae', sessionDir: '~/conect-management/general-affairs' },
  ],

  /**
   * Branch name prefix → department, used only when a PR links no labelled Issue. Checked top to
   * bottom; the first prefix the branch starts with wins.
   * 要調整: guessed from the folder names of conect-management and the `docs/<topic>-...` habit.
   */
  branchPrefixes: [
    { prefix: 'accounting/', department: '経理' },
    { prefix: 'docs/accounting-', department: '経理' },
    { prefix: 'pr/', department: '広報' },
    { prefix: 'docs/pr-', department: '広報' },
    { prefix: 'planning/', department: '企画' },
    { prefix: 'docs/planning-', department: '企画' },
    { prefix: 'general-affairs/', department: '総務' },
    { prefix: 'docs/general-affairs-', department: '総務' },
  ],

  /**
   * Files whose change needs the president's merge (社長の承認まち). Plain string comparisons, no
   * glob: exact (the path equals), suffix (ends with), prefix (starts with).
   */
  ruleChangePaths: [
    { match: 'exact', path: 'CLAUDE.md' },
    { match: 'suffix', path: '/CLAUDE.md' },
    { match: 'prefix', path: '.claude/agents/' },
  ],
} as const satisfies GuildSettingsInput;
