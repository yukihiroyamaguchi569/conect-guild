import { z } from 'zod';

/**
 * owner/name of a GitHub repository: the owner is letters, digits and hyphens (not starting or
 * ending with a hyphen), the name letters, digits, `.`, `_` and `-` but not `.` or `..` alone.
 */
const REPO_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\/(?!\.{1,2}$)[\w.-]+$/;

/**
 * The six member ids. They stay fixed: the sprites (`assets/sprites/<id>.png`), the hands and the
 * seats are keyed by them (laying out seats for another number of departments is Issue #18).
 * kaname is the 司令塔 and yukihiro the president; the other four sit at the department desks.
 */
export const COMMANDER_ID = 'kaname';
export const PRESIDENT_ID = 'yukihiro';
export const DEPARTMENT_MEMBER_IDS = ['minori', 'hibiki', 'hirame', 'sasae'] as const;
export const memberIdSchema = z.enum([COMMANDER_ID, ...DEPARTMENT_MEMBER_IDS, PRESIDENT_ID]);
export type MemberId = z.infer<typeof memberIdSchema>;

const memberSchema = z.strictObject({
  name: z.string().min(1),
  role: z.string().min(1),
  color: z.string().regex(/^#[0-9a-f]{6}$/i, 'a colour like #4caf50'),
});

/** True when the text has a control character (U+0000–U+001F or U+007F). */
function hasControlCharacter(text: string): boolean {
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

/**
 * Where a company session is started, exactly as MulmoTerminal records it: `~` or `~/...` (under
 * the home directory) or an absolute path. No surrounding whitespace, no control characters, no
 * trailing `/`, no empty, `.` or `..` segments, since the collector compares the paths as plain
 * strings (docs/DESIGN.md 4.7).
 */
export function isSessionDir(dir: string): boolean {
  // The collector trims each cwd log line, so a path with surrounding whitespace never matches.
  if (dir !== dir.trim()) return false;
  // A line break or other control character would split or garble the cwd log line.
  if (hasControlCharacter(dir)) return false;
  if (dir === '~') return true;
  const prefix = ['~/', '/'].find((p) => dir.startsWith(p));
  if (prefix === undefined || dir === prefix) return false;
  return dir
    .slice(prefix.length)
    .split('/')
    .every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

const sessionDirSchema = z
  .string()
  .refine(isSessionDir, '~, ~/... or /... without a trailing / or surrounding spaces');

const departmentSchema = z.strictObject({
  /** The GitHub label. The order of `departments` is the fixed order used for several labels. */
  label: z.string().min(1),
  member: z.enum(DEPARTMENT_MEMBER_IDS),
  sessionDir: sessionDirSchema,
});

const branchPrefixSchema = z.strictObject({
  prefix: z.string().min(1),
  department: z.string().min(1),
});

/** Plain string comparisons, no glob: equals, ends with, starts with. */
const ruleChangePathSchema = z.strictObject({
  match: z.enum(['exact', 'suffix', 'prefix']),
  path: z.string().min(1),
});
export type RuleChangePath = z.infer<typeof ruleChangePathSchema>;

function duplicates(values: readonly string[]): string[] {
  return values.filter((value, i) => values.indexOf(value) !== i);
}

export const guildSettingsSchema = z
  .strictObject({
    repo: z.string().regex(REPO_PATTERN, 'owner/name'),
    members: z.record(memberIdSchema, memberSchema),
    commanderSessionDir: sessionDirSchema,
    departments: z.array(departmentSchema).readonly(),
    branchPrefixes: z.array(branchPrefixSchema).readonly(),
    ruleChangePaths: z.array(ruleChangePathSchema).readonly(),
  })
  .superRefine((settings, ctx) => {
    const labels = settings.departments.map((d) => d.label);
    const members = settings.departments.map((d) => d.member);
    const dirs = [settings.commanderSessionDir, ...settings.departments.map((d) => d.sessionDir)];
    const issue = (path: (string | number)[], message: string): void => {
      ctx.addIssue({ code: 'custom', path, message });
    };
    if (settings.departments.length !== DEPARTMENT_MEMBER_IDS.length) {
      issue(['departments'], `exactly ${String(DEPARTMENT_MEMBER_IDS.length)} departments (#18)`);
    }
    // Quoted as JSON: a value with a line break or a control character stays on one line.
    for (const label of duplicates(labels)) {
      issue(['departments'], `label ${JSON.stringify(label)} twice`);
    }
    for (const member of duplicates(members)) issue(['departments'], `member ${member} twice`);
    for (const dir of duplicates(dirs)) {
      issue(['departments'], `session dir ${JSON.stringify(dir)} twice`);
    }
    settings.branchPrefixes.forEach((rule, i) => {
      if (!labels.includes(rule.department)) {
        issue(['branchPrefixes', i, 'department'], 'not a department label');
      }
    });
  });

/** The settings once checked. */
export type GuildSettings = z.output<typeof guildSettingsSchema>;

/**
 * Validates the settings read from a JSON file; an invalid value stops with a message. `source`
 * names the file: the browser cannot tell which one was read (the collector logs it at start).
 */
export function checkGuildSettings(
  raw: unknown,
  source = 'guild.settings.local.json or guild.settings.json (whichever is used)',
): GuildSettings {
  const result = guildSettingsSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`${source} is invalid:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
