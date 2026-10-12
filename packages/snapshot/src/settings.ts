import { z } from 'zod';
// Data only: the JSON is parsed, never run. When guild.settings.local.json exists, the collector
// (src/settingsHook.ts) and the dev server (vite-plugin-settings.ts) send this import there.
import RAW_SETTINGS from '../../../guild.settings.json' with { type: 'json' };
import { checkGuildSettings } from './settingsSchema.ts';

// The schema has no settings in it, so the collector can check a file before importing this.
export * from './settingsSchema.ts';

/** Validated when this module is first imported: the collector and the web app stop at start. */
export const GUILD_SETTINGS = checkGuildSettings(RAW_SETTINGS);

/** Department labels in the fixed order (an Issue with several labels goes to the first one). */
export const DEPARTMENT_LABELS = GUILD_SETTINGS.departments.map((d) => d.label);
export type DepartmentLabel = (typeof DEPARTMENT_LABELS)[number];
export const departmentLabelSchema = z.enum(DEPARTMENT_LABELS);

/** One row of `branchPrefixes`, with the department narrowed to a label. */
export interface BranchPrefixRule {
  readonly prefix: string;
  readonly department: DepartmentLabel;
}

/**
 * Department from the branch name prefix table, or null when no rule matches. Checked top to
 * bottom; the first rule whose prefix the branch starts with wins. Shared by the collector (which
 * stores only this department in the history, never the branch name) and the web app.
 */
export function departmentFromBranch(
  headRef: string,
  rules: readonly BranchPrefixRule[],
): DepartmentLabel | null {
  return rules.find((rule) => headRef.startsWith(rule.prefix))?.department ?? null;
}
