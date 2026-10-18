import { describe, expect, it } from 'vitest';
import { visitsOn } from '../domain/visitors';
import type { MemberId } from '../guild.config';
import type { MemberPose } from './director';
import type { IdlePose } from './idle';
import { tileToPoint } from './path';
import { DEFAULT_SEATS } from './scenes';
import { createVisitorStage, localTimeOf, visitorScene, type VisitorScene } from './visitorStage';
import { DOOR, spotFor, VISITOR } from './visitors';

const DAY = { year: 2026, month: 10, day: 12 };
const [FIRST] = visitsOn(DAY);
if (FIRST === undefined) throw new Error('no visit on the day');

/** Epoch ms of `minute` past the local midnight of DAY. */
const wallAt = (minute: number) => new Date(2026, 9, 12, 0, 0).getTime() + minute * 60_000;

const QUIET: VisitorScene = {
  busy: false,
  free: [{ id: 'minori', seat: DEFAULT_SEATS.minori }],
};
const BUSY: VisitorScene = { ...QUIET, busy: true };

/** A stage whose wall clock reads `minute` of DAY (changed by `set`). */
function stageAt(minute: number) {
  let wall = wallAt(minute);
  const stage = createVisitorStage(() => wall);
  return {
    stage,
    set: (next: number) => {
      wall = wallAt(next);
    },
  };
}

/** Frames every 100 ms from `from` to `to` (stage ms): the visitor of each. */
function play(
  stage: ReturnType<typeof createVisitorStage>,
  span: { from: number; to: number },
  scene: (t: number) => VisitorScene = () => QUIET,
) {
  const seen = [];
  for (let t = span.from; t < span.to; t += 100) seen.push(stage.frameAt(t, scene(t)));
  return seen;
}

describe('localTimeOf', () => {
  it('reads the local day and the minutes past its midnight', () => {
    const at = new Date(2026, 9, 12, 13, 45, 30).getTime();
    expect(localTimeOf(at)).toEqual({ day: DAY, minute: 13 * 60 + 45.5 });
  });
});

describe('createVisitorStage', () => {
  it('brings the visit due when the room is quiet, once', () => {
    const { stage } = stageAt(FIRST.at);
    expect(stage.frameAt(0, QUIET)?.feet).toEqual(tileToPoint(DOOR));
    const seen = play(stage, { from: 0, to: 60_000 });
    expect(seen.some((view) => view !== null && view.words !== null)).toBe(true);
    const gone = seen.findIndex((view, i) => i > 0 && view === null);
    expect(gone).toBeGreaterThan(0);
    // It came: it does not come again, though its time is still within the grace.
    expect(seen.slice(gone).every((view) => view === null)).toBe(true);
  });

  it('brings nobody before the time, and nobody once the grace is over', () => {
    expect(stageAt(FIRST.at - 1).stage.frameAt(0, QUIET)).toBeNull();
    expect(stageAt(FIRST.at + VISITOR.graceMinutes).stage.frameAt(0, QUIET)).toBeNull();
    expect(stageAt(FIRST.at + VISITOR.graceMinutes - 0.1).stage.frameAt(0, QUIET)).not.toBeNull();
  });

  it('waits while the room is busy, and comes once it is quiet within the grace', () => {
    const { stage, set } = stageAt(FIRST.at);
    expect(stage.frameAt(0, BUSY)).toBeNull();
    set(FIRST.at + 5);
    expect(stage.frameAt(100, BUSY)).toBeNull();
    expect(stage.frameAt(200, QUIET)).not.toBeNull();
  });

  it('gives up when the room stays busy past the grace', () => {
    const { stage, set } = stageAt(FIRST.at);
    expect(stage.frameAt(0, BUSY)).toBeNull();
    set(FIRST.at + VISITOR.graceMinutes);
    expect(stage.frameAt(100, QUIET)).toBeNull();
  });

  it('waits for someone free to speak to, without using the visit up', () => {
    const { stage } = stageAt(FIRST.at);
    expect(stage.frameAt(0, { busy: false, free: [] })).toBeNull();
    expect(stage.frameAt(100, QUIET)).not.toBeNull();
  });

  it('goes to the member the visit picks among those free', () => {
    const free: VisitorScene['free'] = (['kaname', 'minori', 'hibiki'] as const).map((id) => ({
      id,
      seat: DEFAULT_SEATS[id],
    }));
    const { stage } = stageAt(FIRST.at);
    const seen = play(stage, { from: 0, to: 60_000 }, () => ({ busy: false, free }));
    const talking = seen.find((view) => view !== null && view.words !== null);
    const chosen = free[Math.floor(FIRST.pick * free.length)];
    if (chosen === undefined) throw new Error('nobody chosen');
    expect(talking?.feet).toEqual(tileToPoint(spotFor(chosen.id, chosen.seat)));
  });
});

describe('createVisitorStage, turning back', () => {
  it('turns back to the door without a word when a scene starts on its way in', () => {
    const { stage } = stageAt(FIRST.at);
    play(stage, { from: 0, to: 1_000 });
    const after = play(stage, { from: 1_000, to: 60_000 }, () => BUSY);
    expect(after.every((view) => (view?.words ?? null) === null)).toBe(true);
    const last = after.findLast((view) => view !== null);
    expect(last?.feet.x).toBeGreaterThan(tileToPoint(DOOR).x - 33);
    expect(after.at(-1)).toBeNull();
  });

  it('turns back when the screen halts, and brings nobody while halted', () => {
    const { stage } = stageAt(FIRST.at);
    play(stage, { from: 0, to: 1_000 });
    stage.setHalted(true, 1_000);
    const after = play(stage, { from: 1_000, to: 60_000 });
    expect(after.every((view) => (view?.words ?? null) === null)).toBe(true);
    expect(after.at(-1)).toBeNull();
    const next = visitsOn(DAY)[1];
    if (next === undefined) throw new Error('no second visit');
    const halted = stageAt(next.at);
    halted.stage.setHalted(true, 0);
    expect(halted.stage.frameAt(0, QUIET)).toBeNull();
    halted.stage.setHalted(false, 100);
    expect(halted.stage.frameAt(100, QUIET)).not.toBeNull();
  });

  it('drops the visitor at once when the canvas goes out of sight, and it does not come back', () => {
    const { stage } = stageAt(FIRST.at);
    expect(stage.frameAt(0, QUIET)).not.toBeNull();
    stage.clear();
    expect(stage.frameAt(100, QUIET)).toBeNull();
  });
});

/** A member pose at the seat: awake and out of scenes unless told otherwise. */
function member(id: MemberId, over: Partial<MemberPose> = {}): MemberPose {
  const point = tileToPoint(DEFAULT_SEATS[id]);
  return {
    id,
    pose: { point, frame: 0, flip: false, held: null },
    depth: point.y,
    hand: null,
    inScene: false,
    mark: null,
    atSeat: true,
    withPet: false,
    ...over,
  };
}

function idlePose(walking: boolean): IdlePose {
  const from = DEFAULT_SEATS.hibiki;
  const to = walking ? { col: from.col + 1, row: from.row } : from;
  return {
    feet: tileToPoint(from),
    step: { from, to, progress: 0.5 },
    frame: 2,
    flip: false,
    offset: { x: 0, y: 0 },
    mark: null,
    withPet: false,
  };
}

describe('visitorScene', () => {
  it('lists the members free at their seat in the members’ order, never the king', () => {
    const members = [member('hibiki'), member('yukihiro'), member('kaname'), member('minori')];
    expect(visitorScene(members, {}, false)).toEqual({
      busy: false,
      free: (['kaname', 'minori', 'hibiki'] as const).map((id) => ({
        id,
        seat: DEFAULT_SEATS[id],
      })),
    });
  });

  it('leaves out those in a scene, away from the seat, or dozing and asleep', () => {
    const members = [
      member('kaname', { inScene: true }),
      member('minori', { atSeat: false }),
      member('hibiki', { mark: { kind: 'z', rise: 0 } }),
    ];
    expect(visitorScene(members, { hibiki: idlePose(false) }, false).free).toEqual([]);
  });

  it('leaves out a member in a long idle spell at the seat even between the dozing 「…」', () => {
    const dozing = { ...idlePose(false), frame: 0 as const, mark: null };
    const members = [member('hibiki'), member('minori')];
    expect(visitorScene(members, { hibiki: dozing }, false).free).toEqual([
      { id: 'minori', seat: DEFAULT_SEATS.minori },
    ]);
  });

  it('is busy while a scene or a call plays, or a member walks to or from play', () => {
    expect(visitorScene([], {}, true).busy).toBe(true);
    expect(visitorScene([], { hibiki: idlePose(true) }, false).busy).toBe(true);
    expect(visitorScene([], { hibiki: idlePose(false) }, false).busy).toBe(false);
  });
});
