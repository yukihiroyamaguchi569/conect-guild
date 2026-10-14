import { DEPARTMENT_LABELS } from '@conect-guild/snapshot/settings';
import { layoutFor } from './catalog';
import type { GuildLayout } from './types';

export { LAYOUTS, layoutFor } from './catalog';

/** The layout of the settings in use. */
export const SELECTED_LAYOUT: GuildLayout = layoutFor(DEPARTMENT_LABELS.length);
