import { describe, expect, it } from 'vitest';
import { makeSettings } from '@conect-guild/snapshot/settings.fixtures';
import { guildFromSettings } from '../../guildFromSettings';
import { LAYOUT4 } from './layout4';
import { seatsFor } from './seats';
import type { GuildLayout } from './types';

/** A made-up layout with the first two desks of LAYOUT4, to seat fewer members than ids. */
const TWO_DESKS: GuildLayout = { ...LAYOUT4, departmentCount: 2, desks: LAYOUT4.desks.slice(0, 2) };

describe('seatsFor', () => {
  it('seats かなめ at the counter, the king on the throne and departments at their desks', () => {
    expect(seatsFor(LAYOUT4, ['minori', 'hibiki', 'hirame', 'sasae'])).toEqual({
      kaname: { col: 16, row: 7 },
      minori: { col: 12, row: 4 },
      hibiki: { col: 20, row: 4 },
      hirame: { col: 11, row: 10 },
      sasae: { col: 21, row: 10 },
      takumi: LAYOUT4.offstage,
      musubi: LAYOUT4.offstage,
      yukihiro: { col: 16, row: 3 },
    });
  });

  it('follows the departments order, not the ids', () => {
    const seats = seatsFor(LAYOUT4, ['sasae', 'hirame', 'hibiki', 'minori']);
    expect(seats.sasae).toEqual(LAYOUT4.desks[0]?.seat);
    expect(seats.minori).toEqual(LAYOUT4.desks[3]?.seat);
  });

  it('puts a member no department names off stage', () => {
    const seats = seatsFor(TWO_DESKS, ['hibiki', 'minori']);
    expect(seats.hibiki).toEqual(LAYOUT4.desks[0]?.seat);
    expect(seats.minori).toEqual(LAYOUT4.desks[1]?.seat);
    expect(seats.hirame).toEqual(LAYOUT4.offstage);
    expect(seats.sasae).toEqual(LAYOUT4.offstage);
    expect(seats.kaname).toEqual(LAYOUT4.commanderSeat);
  });

  it('refuses departments that do not match the desks', () => {
    expect(() => seatsFor(LAYOUT4, ['minori', 'hibiki'])).toThrow(/2 departments.*4 desks/);
    expect(() => seatsFor(TWO_DESKS, [])).toThrow(/0 departments/);
  });
});

describe('guildFromSettings with a layout', () => {
  it('takes the seats from the given layout and keeps a member with no desk off stage', () => {
    const settings = makeSettings(2);
    const { sasae, ...members } = settings.members;
    expect(sasae).toBeDefined();
    const guild = guildFromSettings({ ...settings, members }, TWO_DESKS);
    expect(guild.members.minori.seat).toEqual(LAYOUT4.desks[0]?.seat);
    expect(guild.members.hibiki.seat).toEqual(LAYOUT4.desks[1]?.seat);
    expect(guild.members.sasae.seat).toEqual(LAYOUT4.offstage);
    expect(guild.members.sasae.id).toBe('sasae');
  });

  it('has no layout for a count without one', () => {
    expect(() => guildFromSettings(makeSettings(1))).toThrow(/no office layout for 1/);
  });
});
