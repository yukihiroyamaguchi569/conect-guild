/**
 * What the web app derives from the guild settings, as a pure function of the settings it is given.
 * Imports only types from the settings module, so loading this file never reads the repository's
 * guild.settings.json (guild.config.ts applies it to the real settings).
 */
import { z } from 'zod';
import type { BranchPrefixRule, DepartmentLabel } from '@conect-guild/snapshot/settings';
import {
  memberIdSchema,
  type GuildSettings,
  type MemberId,
  type RuleChangePath,
} from '@conect-guild/snapshot/settingsSchema';

/** A cell on the office tile map (32 px tiles, 32 x 18; src/render/map.ts). */
export interface TilePos {
  readonly col: number;
  readonly row: number;
}

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

/** Seats for the four department desks, the reception and the throne (Issue #18 to vary them). */
const SEATS: Readonly<Record<MemberId, TilePos>> = {
  kaname: { col: 16, row: 7 },
  minori: { col: 12, row: 4 },
  hibiki: { col: 20, row: 4 },
  hirame: { col: 11, row: 10 },
  sasae: { col: 21, row: 10 },
  // The throne is three tiles wide and high (cols 15-17, rows 2-4): the king sits in its middle.
  yukihiro: { col: 16, row: 3 },
};

/** What the web app derives from the settings alone (the seats and windows stay constants). */
export interface Guild {
  readonly members: Readonly<Record<MemberId, MemberConfig>>;
  /** Department label → the member who works it. */
  readonly departmentMember: Readonly<Record<DepartmentLabel, MemberId>>;
  readonly branchPrefixRules: readonly BranchPrefixRule[];
  readonly ruleChangePaths: readonly RuleChangePath[];
}

/**
 * The team from the given settings, without reading the module-level GUILD_SETTINGS, so tests can
 * pass made-up settings. The department record is checked against the settings' own labels: a
 * label the settings do not map fails here instead of yielding undefined later.
 */
export function guildFromSettings(settings: GuildSettings): Guild {
  const memberConfig = (id: MemberId): MemberConfig => {
    const { name, role, color } = settings.members[id];
    return { id, name, role, color, seat: SEATS[id] };
  };
  const labels = settings.departments.map((d) => d.label);
  return {
    members: {
      kaname: memberConfig('kaname'),
      minori: memberConfig('minori'),
      hibiki: memberConfig('hibiki'),
      hirame: memberConfig('hirame'),
      sasae: memberConfig('sasae'),
      yukihiro: memberConfig('yukihiro'),
    },
    departmentMember: z
      .record(z.enum(labels), memberIdSchema)
      .parse(Object.fromEntries(settings.departments.map((d) => [d.label, d.member]))),
    branchPrefixRules: settings.branchPrefixes,
    ruleChangePaths: settings.ruleChangePaths,
  };
}
