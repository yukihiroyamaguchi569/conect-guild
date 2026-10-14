import { describe, expect, it } from 'vitest';
import { ACTIVE_MEMBER_IDS, MEMBERS } from '../../guild.config';
import { ANIMATED_DECOR, STILL_DECOR } from '../animatedDecor';
import { DECOR_PLACEMENTS } from '../decor';
import { BACK_OBJECTS, FRONT_LAYERS } from '../layers';
import { GROUND, MAP_OBJECTS, PLACES, TALLEST_WINDOW_EXTENTS, WINDOW_EXTENTS } from '../map';
import { TOSS } from '../metrics';
import { PLAY_SPOTS } from '../idleSpots';
import { DEFAULT_SEATS } from '../scenes';
import { SEAT_SINK } from '../seating';

/**
 * The four-department office as it was before the layouts (Issue #18): the ground, the furniture,
 * the decor, the seats and everything derived from them, one line each, compared with a file
 * written before the refactor. A change here is a change of today's office.
 */

const tile = (pos: { readonly col: number; readonly row: number }): string =>
  `${String(pos.col)},${String(pos.row)}`;
const area = (r: { col: number; row: number; w: number; h: number }): string =>
  `${tile(r)} ${String(r.w)}x${String(r.h)}`;

function lines(): string[] {
  return [
    ...GROUND.map((row, i) => `ground ${String(i)}: ${row.join(' ')}`),
    ...MAP_OBJECTS.map((o) => `object ${o.tile} ${area(o)} solid=${String(o.solid)}`),
    ...DECOR_PLACEMENTS.map((d) => `decor ${d.name} ${area(d)} solid=${String(d.solid)}`),
    // The members of the office: ids no department names (off stage) came after the recording.
    ...ACTIVE_MEMBER_IDS.map((id) => `seat ${id} ${tile(DEFAULT_SEATS[id])}`),
    ...ACTIVE_MEMBER_IDS.map((id) => `member ${id} ${tile(MEMBERS[id].seat)}`),
    ...Object.entries(PLACES).map(([name, pos]) => `place ${name} ${tile(pos)}`),
    ...Object.entries(WINDOW_EXTENTS).map(([name, r]) => `window ${name} ${JSON.stringify(r)}`),
    ...Object.entries(TALLEST_WINDOW_EXTENTS).map(
      ([name, r]) => `tallest ${name} ${JSON.stringify(r)}`,
    ),
    `toss maxTiles ${String(TOSS.maxTiles)}`,
    ...[...SEAT_SINK].map(([key, px]) => `sink ${key} ${String(px)}`),
    ...Object.entries(PLAY_SPOTS).flatMap(([id, spots]) =>
      spots.map(
        (s) =>
          `play ${id} ${s.kind} ${tile(s.tile)} partner=${String(s.partner)} path=${s.path.map(tile).join(' ')}`,
      ),
    ),
    ...FRONT_LAYERS.map(
      (l) =>
        `layer ${String(l.depth)} objects=${l.objects.map((o) => area(o)).join('|')} parts=${String(l.parts.length)} still=${l.still.map((d) => d.name).join(',')} animated=${l.animated.map((a) => a.placement.name).join(',')}`,
    ),
    `back ${BACK_OBJECTS.map((o) => o.tile).join(',')}`,
    `still ${STILL_DECOR.map((d) => d.name + '@' + tile(d)).join(',')}`,
    ...ANIMATED_DECOR.map(
      (a) =>
        `animated ${a.placement.name}@${tile(a.placement)} ${a.motion} phase=${String(a.phaseMs)} trigger=${JSON.stringify(a.trigger)}`,
    ),
  ];
}

describe('layout4 golden', () => {
  it('builds the same office as before the layouts', async () => {
    await expect(`${lines().join('\n')}\n`).toMatchFileSnapshot('./__golden__/layout4.txt');
  });
});
