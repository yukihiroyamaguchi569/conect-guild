/**
 * What the web app derives from the guild settings, as a pure function of the settings it is given.
 * Imports only types from the settings module and the layout data (render/layouts/catalog.ts, which
 * reads no settings), so loading this file never reads the repository's guild.settings.json
 * (guild.config.ts applies it to the real settings and the selected layout).
 */
import { z } from 'zod';
import type { BranchPrefixRule, DepartmentLabel } from '@conect-guild/snapshot/settings';
import {
  byMember,
  memberIdSchema,
  type GuildSettings,
  type MemberId,
  type RuleChangePath,
} from '@conect-guild/snapshot/settingsSchema';
import { layoutFor } from './render/layouts/catalog';
import { seatsFor } from './render/layouts/seats';
import type { GuildLayout, TilePos } from './render/layouts/types';

/** A cell on the office tile map (32 px tiles, 32 x 18; src/render/map.ts). */
export type { TilePos };

export interface MemberConfig {
  readonly id: MemberId;
  /** Display name. */
  readonly name: string;
  /** Role shown next to the name. */
  readonly role: string;
  /** Accent colour for the name plate and speech bubble. */
  readonly color: string;
  /**
   * Where the member is when at home: the tile under their feet (src/render/map.ts). Department
   * members sit on the chair right behind their desk; render/seating.ts sinks them into it.
   */
  readonly seat: TilePos;
}

/**
 * Shown for a member no department names: never on screen (only the active members are drawn), it
 * keeps MEMBERS a record of every id.
 */
const OFFSTAGE_MEMBER = { name: '-', role: '-', color: '#808080' } as const;

/** What the web app derives from the settings and the office layout (the windows stay constants). */
export interface Guild {
  readonly members: Readonly<Record<MemberId, MemberConfig>>;
  /** Department label → the member who works it. */
  readonly departmentMember: Readonly<Record<DepartmentLabel, MemberId>>;
  readonly branchPrefixRules: readonly BranchPrefixRule[];
  readonly ruleChangePaths: readonly RuleChangePath[];
}

/**
 * The team from the given settings, without reading the module-level GUILD_SETTINGS, so tests can
 * pass made-up settings. The seats come from `layout` (by default the one for the settings' number
 * of departments). The department record is checked against the settings' own labels: a label the
 * settings do not map fails here instead of yielding undefined later.
 */
export function guildFromSettings(
  settings: GuildSettings,
  layout: GuildLayout = layoutFor(settings.departments.length),
): Guild {
  const seats = seatsFor(
    layout,
    settings.departments.map((d) => d.member),
  );
  const labels = settings.departments.map((d) => d.label);
  return {
    members: byMember((id): MemberConfig => {
      const { name, role, color } = settings.members[id] ?? OFFSTAGE_MEMBER;
      return { id, name, role, color, seat: seats[id] };
    }),
    departmentMember: z
      .record(z.enum(labels), memberIdSchema)
      .parse(Object.fromEntries(settings.departments.map((d) => [d.label, d.member]))),
    branchPrefixRules: settings.branchPrefixes,
    ruleChangePaths: settings.ruleChangePaths,
  };
}
