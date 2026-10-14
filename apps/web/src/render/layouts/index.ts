import { DEPARTMENT_LABELS } from '@conect-guild/snapshot/settings';
import { LAYOUT4 } from './layout4';
import type { GuildLayout } from './types';

/**
 * The office layouts by number of departments (Issue #18): each is made by hand. The settings
 * accept only SUPPORTED_DEPARTMENT_COUNTS, which grows with this record.
 */
export const LAYOUTS: Readonly<Record<number, GuildLayout>> = {
  4: LAYOUT4,
};

/** The layout for `departmentCount` departments; a count without one is a bug (settings check it). */
export function layoutFor(departmentCount: number): GuildLayout {
  const layout = LAYOUTS[departmentCount];
  if (layout === undefined) {
    throw new Error(`no office layout for ${String(departmentCount)} departments (#18)`);
  }
  return layout;
}

/** The layout of the settings in use. */
export const SELECTED_LAYOUT: GuildLayout = layoutFor(DEPARTMENT_LABELS.length);
