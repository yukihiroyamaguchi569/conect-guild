import { z } from 'zod';

/**
 * owner/name of a GitHub repository: the owner is letters, digits and hyphens (not starting or
 * ending with a hyphen), the name letters, digits, `.`, `_` and `-` but not `.` or `..` alone.
 */
const REPO_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\/(?!\.{1,2}$)[\w.-]+$/;

/**
 * The member ids. They stay fixed: the sprites (`assets/sprites/<id>.png`), the hands and the
 * lines are keyed by them. kaname is the 司令塔 and yukihiro the president; the others may sit at
 * the department desks (`departments[i].member`), and one no department names stays off stage.
 */
export const COMMANDER_ID = 'kaname';
export const PRESIDENT_ID = 'yukihiro';
export const DEPARTMENT_MEMBER_IDS = ['minori', 'hibiki', 'hirame', 'sasae'] as const;
export const memberIdSchema = z.enum([COMMANDER_ID, ...DEPARTMENT_MEMBER_IDS, PRESIDENT_ID]);
export type MemberId = z.infer<typeof memberIdSchema>;
export type DepartmentMemberId = (typeof DEPARTMENT_MEMBER_IDS)[number];

/**
 * A record with a value for every member id, made in the order of memberIdSchema (so a value drawn
 * from a random source draws in that order). The one place that lists the ids by hand: the type
 * checker asks for a new id here.
 */
export function byMember<V>(valueOf: (id: MemberId) => V): Record<MemberId, V> {
  return {
    kaname: valueOf('kaname'),
    minori: valueOf('minori'),
    hibiki: valueOf('hibiki'),
    hirame: valueOf('hirame'),
    sasae: valueOf('sasae'),
    yukihiro: valueOf('yukihiro'),
  };
}

/**
 * The numbers of departments the office has a layout for (apps/web/src/render/layouts). It grows
 * as layouts are drawn (Issue #18).
 */
export const SUPPORTED_DEPARTMENT_COUNTS: readonly number[] = [2, 3, 4];

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

/**
 * Issue #108: a session outside the company, named in the settings, that visits the guild. Its
 * folder is read like a company one (exact match only, docs/DESIGN.md 4.7); its repository, when
 * given, is read for its open and recently finished Issues and PRs (4.1). The name is shown on the
 * screen only: it never goes into the snapshot or a log.
 */
const guestSchema = z.strictObject({
  name: z.string().min(1).max(12),
  sessionDir: sessionDirSchema,
  repo: z.string().regex(REPO_PATTERN, 'owner/name').optional(),
});

/** At most two guests (Issue #108, the president's decision). */
export const MAX_GUESTS = 2;
export type GuildGuest = z.output<typeof guestSchema>;

function duplicates(values: readonly string[]): string[] {
  return values.filter((value, i) => values.indexOf(value) !== i);
}

interface GuestCheckInput {
  readonly repo: string;
  readonly commanderSessionDir: string;
  readonly departments: readonly { readonly sessionDir: string }[];
  readonly guests?: readonly z.output<typeof guestSchema>[];
}

/**
 * Issue #108: guests differ from each other by name and folder, and from the company by folder
 * and repository (GitHub names compare without case). Issues name a guest by its position only.
 */
function checkGuests(
  settings: GuestCheckInput,
  issue: (path: (string | number)[], message: string) => void,
): void {
  const guests = settings.guests ?? [];
  const companyDirs = new Set([
    settings.commanderSessionDir,
    ...settings.departments.map((d) => d.sessionDir),
  ]);
  const companyRepo = settings.repo.toLowerCase();
  guests.forEach((guest, i) => {
    const earlier = guests.slice(0, i);
    if (earlier.some((other) => other.name === guest.name)) {
      issue(['guests', i, 'name'], 'name used by another guest');
    }
    if (companyDirs.has(guest.sessionDir)) {
      issue(['guests', i, 'sessionDir'], 'a company session dir');
    } else if (earlier.some((other) => other.sessionDir === guest.sessionDir)) {
      issue(['guests', i, 'sessionDir'], 'session dir used by another guest');
    }
    if (guest.repo?.toLowerCase() === companyRepo) {
      issue(['guests', i, 'repo'], 'the company repo');
    }
  });
}

export const guildSettingsSchema = z
  .strictObject({
    repo: z.string().regex(REPO_PATTERN, 'owner/name'),
    // Only the members on stage are required (checked below): かなめ, the king and each
    // department's member.
    members: z.partialRecord(memberIdSchema, memberSchema),
    commanderSessionDir: sessionDirSchema,
    departments: z.array(departmentSchema).readonly(),
    branchPrefixes: z.array(branchPrefixSchema).readonly(),
    ruleChangePaths: z.array(ruleChangePathSchema).readonly(),
    guests: z.array(guestSchema).max(MAX_GUESTS).readonly().optional(),
  })
  .superRefine((settings, ctx) => {
    const labels = settings.departments.map((d) => d.label);
    const members = settings.departments.map((d) => d.member);
    const dirs = [settings.commanderSessionDir, ...settings.departments.map((d) => d.sessionDir)];
    const issue = (path: (string | number)[], message: string): void => {
      ctx.addIssue({ code: 'custom', path, message });
    };
    if (!SUPPORTED_DEPARTMENT_COUNTS.includes(settings.departments.length)) {
      const counts = SUPPORTED_DEPARTMENT_COUNTS.join(' or ');
      issue(['departments'], `${counts} departments (#18)`);
    }
    for (const id of new Set<MemberId>([COMMANDER_ID, PRESIDENT_ID, ...members])) {
      if (settings.members[id] === undefined) issue(['members', id], 'missing');
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
    checkGuests(settings, issue);
  });

/**
 * What a terminal could act on, by Unicode category: the controls (Cc: C0 with the line breaks, DEL,
 * C1), the format characters (Cf: every bidi mark, override and isolate, zero-width characters)
 * and the line and paragraph separators (Zl, Zp). One character at a time (no `g` flag).
 */
const TERMINAL_CONTROL = /^[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]$/u;

/**
 * Every character a terminal could act on as a `\\uXXXX` escape, so text from a file or an input
 * (a label, a key) is shown as characters on its own line and cannot move the cursor, add a line
 * or reorder one. Shared with the settings writer (packages/collector/src/settingsText.ts).
 */
export function escapeForTerminal(text: string): string {
  return Array.from(text, (char) => {
    if (!TERMINAL_CONTROL.test(char)) return char;
    // Each UTF-16 unit (a surrogate pair for a character past U+FFFF), as JSON writes them.
    return Array.from(
      { length: char.length },
      (_, i) => `\\u${char.charCodeAt(i).toString(16).padStart(4, '0')}`,
    ).join('');
  }).join('');
}

function pathText(path: readonly PropertyKey[]): string {
  return path
    .map((key, i) => {
      if (typeof key === 'number') return `[${String(key)}]`;
      return i === 0 ? String(key) : `.${String(key)}`;
    })
    .join('');
}

/**
 * The issues in the shape of z.prettifyError (`✖ message` and `→ at path`), but with each message
 * and path kept on its own line: a value or key from the file (an unknown key with a line break,
 * say) is escaped, so it can never add a line that looks like another result.
 */
export function describeIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const message = `✖ ${escapeForTerminal(issue.message)}`;
      if (issue.path.length === 0) return message;
      return `${message}\n  → at ${escapeForTerminal(pathText(issue.path))}`;
    })
    .join('\n');
}

/** The settings once checked. */
export type GuildSettings = z.output<typeof guildSettingsSchema>;

/** The members on stage: かなめ, the departments' members in their order, and the king. */
export function activeMemberIds(settings: Pick<GuildSettings, 'departments'>): MemberId[] {
  return [COMMANDER_ID, ...settings.departments.map((d) => d.member), PRESIDENT_ID];
}

/** The members with a level: かなめ, then the departments' members in their order. */
export function levelMemberIds(settings: Pick<GuildSettings, 'departments'>): MemberId[] {
  return [COMMANDER_ID, ...settings.departments.map((d) => d.member)];
}

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
    throw new Error(`${source} is invalid:\n${describeIssues(result.error)}`);
  }
  return result.data;
}
