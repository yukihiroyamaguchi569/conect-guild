import {
  byMember,
  COMMANDER_ID,
  PRESIDENT_ID,
  type MemberId,
} from '@conect-guild/snapshot/settingsSchema';
import type { GuildLayout, TilePos } from './types';

/**
 * Every member's seat in `layout`: かなめ at the counter, the king on the throne, the member of
 * `departmentMembers[i]` (the settings' departments in order) at `desks[i]`, and a member no
 * department names off stage by the door (never drawn: only the active members are).
 */
export function seatsFor(
  layout: GuildLayout,
  departmentMembers: readonly MemberId[],
): Readonly<Record<MemberId, TilePos>> {
  if (departmentMembers.length !== layout.desks.length) {
    throw new Error(
      `${String(departmentMembers.length)} departments for a layout of ${String(layout.desks.length)} desks`,
    );
  }
  return byMember((id) => {
    if (id === COMMANDER_ID) return layout.commanderSeat;
    if (id === PRESIDENT_ID) return layout.kingSeat;
    const index = departmentMembers.indexOf(id);
    return index < 0 ? layout.offstage : (layout.desks[index]?.seat ?? layout.offstage);
  });
}
