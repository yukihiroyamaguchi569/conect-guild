import {
  GUEST_TABLE_CORNER,
  RIGHT_OF_SASAE_GUEST_SPOT,
  SALES_DESK,
  UPPER_RIGHT_DESK,
  WORKSHOP_DESK,
} from './largeRoom';
import {
  FILES_CORNER,
  LIBRARY,
  LOWER_LEFT_SEAT,
  LOWER_RIGHT_SEAT,
  MAP_CORNER,
  MAP_CORNER_GUEST_SPOTS,
  roomWith,
  SMALL_ROOM_GROUND,
  SMALL_ROOM_SEATS,
  TAVERN,
  TAVERN_GUEST_SPOTS,
  UPPER_LEFT_DESK,
  type CornerDesk,
  type DeskCorner,
} from './smallRoom';
import type { Desk, GuildLayout, TilePos } from './types';

/**
 * The six places of a desk and the two rules that fill them (Issue #123, the president's
 * approval of 2026-10-15):
 * 1. The desks fill the places in FILL_ORDER: the lower left and right, the upper left, the upper
 *    right, the left end of the lower row (the workshop), its right end (the sales desk).
 * 2. The guests stand at the next place, the one the next desk would take, behind the tavern's
 *    round table. Six departments leave no place for them. Only two departments differ: their
 *    guests stand in the tavern of the upper right (the next place, the upper left, is a library),
 *    so the tavern stays where it is from two to three departments.
 * A place that is neither a desk nor the guests' is decoration.
 */

const FILL_ORDER = [
  'lowerLeft',
  'lowerRight',
  'upperLeft',
  'upperRight',
  'lowerLeftEnd',
  'lowerRightEnd',
] as const;
export type Place = (typeof FILL_ORDER)[number];
/** The places that change with the number of departments: the lower desks stand in every office. */
type CornerPlace = Exclude<Place, 'lowerLeft' | 'lowerRight'>;

/** Where the guests stand in a place, and the round table before them. */
interface GuestsCorner extends DeskCorner {
  readonly spots: readonly TilePos[];
}

/** What a place holds as a desk, as the guests' place and as decoration (when it can be them). */
interface Corner {
  readonly desk: CornerDesk;
  readonly guests?: GuestsCorner;
  readonly decor?: DeskCorner;
}

const CORNERS: Readonly<Record<CornerPlace, Corner>> = {
  upperLeft: { desk: UPPER_LEFT_DESK, decor: LIBRARY },
  upperRight: { desk: UPPER_RIGHT_DESK, guests: { ...TAVERN, spots: TAVERN_GUEST_SPOTS } },
  lowerLeftEnd: {
    desk: WORKSHOP_DESK,
    guests: { ...MAP_CORNER, spots: MAP_CORNER_GUEST_SPOTS },
    decor: MAP_CORNER,
  },
  lowerRightEnd: {
    desk: SALES_DESK,
    guests: { ...GUEST_TABLE_CORNER, spots: [RIGHT_OF_SASAE_GUEST_SPOT] },
    decor: FILES_CORNER,
  },
};

/** Where each place's member sits. */
export const PLACE_DESKS: Readonly<Record<Place, Omit<Desk, 'chatWith'>>> = {
  lowerLeft: LOWER_LEFT_SEAT,
  lowerRight: LOWER_RIGHT_SEAT,
  upperLeft: CORNERS.upperLeft.desk.desk,
  upperRight: CORNERS.upperRight.desk.desk,
  lowerLeftEnd: CORNERS.lowerLeftEnd.desk.desk,
  lowerRightEnd: CORNERS.lowerRightEnd.desk.desk,
};

/** The order of the desks in the layout (`departments[i]` sits at the i-th): upper row first. */
const SEAT_ORDER: readonly Place[] = [
  'upperLeft',
  'upperRight',
  'lowerLeft',
  'lowerRight',
  'lowerLeftEnd',
  'lowerRightEnd',
];

/** The desks of the same row that chat with each other, when both stand. */
const CHAT_PARTNERS: Readonly<Record<Place, Place>> = {
  upperLeft: 'upperRight',
  upperRight: 'upperLeft',
  lowerLeft: 'lowerRight',
  lowerRight: 'lowerLeft',
  lowerLeftEnd: 'lowerRightEnd',
  lowerRightEnd: 'lowerLeftEnd',
};

/** Rule 1: the places with a desk. */
function deskPlacesFor(departmentCount: number): readonly Place[] {
  return FILL_ORDER.slice(0, departmentCount);
}

const isCorner = (place: Place | undefined): place is CornerPlace =>
  place !== undefined && place !== 'lowerLeft' && place !== 'lowerRight';

/** Rule 2: the place of the guests, none with six departments. */
function guestPlaceFor(departmentCount: number): CornerPlace | undefined {
  if (departmentCount === 2) return 'upperRight';
  const next = FILL_ORDER[departmentCount];
  return isCorner(next) ? next : undefined;
}

function desksAt(places: readonly Place[]): Desk[] {
  const seated = SEAT_ORDER.filter((place) => places.includes(place));
  return seated.map((place) => {
    const partner = seated.indexOf(CHAT_PARTNERS[place]);
    return partner < 0 ? PLACE_DESKS[place] : { ...PLACE_DESKS[place], chatWith: partner };
  });
}

function missing(what: string, place: Place): never {
  throw new Error(`no ${what} in the ${place} place (#123)`);
}

/** The furniture and things of `place` with `departmentCount` departments. */
function cornerFor(place: CornerPlace, departmentCount: number): DeskCorner {
  const corner = CORNERS[place];
  if (deskPlacesFor(departmentCount).includes(place)) return corner.desk;
  if (guestPlaceFor(departmentCount) === place) return corner.guests ?? missing('guests', place);
  return corner.decor ?? missing('decoration', place);
}

function guestSpotsFor(departmentCount: number): readonly TilePos[] {
  const place = guestPlaceFor(departmentCount);
  if (place === undefined) return [];
  return CORNERS[place].guests?.spots ?? missing('guests', place);
}

/** What a layout keeps of its own: the values measured or decided for its number of departments. */
export type LayoutSpecials = Pick<
  GuildLayout,
  'partyWindow' | 'toss' | 'boardMaxCqw' | 'underPartyWindow'
>;

/** The office of `departmentCount` departments, by rules 1 and 2, with its own `specials`. */
export function buildLayout(departmentCount: number, specials: LayoutSpecials): GuildLayout {
  return {
    departmentCount,
    groundFills: SMALL_ROOM_GROUND,
    ...roomWith({
      upperLeft: cornerFor('upperLeft', departmentCount),
      upperRight: cornerFor('upperRight', departmentCount),
      lowerLeftEnd: cornerFor('lowerLeftEnd', departmentCount),
      lowerRightEnd: cornerFor('lowerRightEnd', departmentCount),
    }),
    desks: desksAt(deskPlacesFor(departmentCount)),
    ...SMALL_ROOM_SEATS,
    guestSpots: guestSpotsFor(departmentCount),
    ...specials,
  };
}
