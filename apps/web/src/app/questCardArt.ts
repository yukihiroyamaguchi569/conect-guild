import backUrl from '../../../../assets/card/back.webp';
import crownFrameUrl from '../../../../assets/card/frame-crown.webp';
import metalFrameUrl from '../../../../assets/card/frame-dept-metal.webp';
import scrollFrameUrl from '../../../../assets/card/frame-dept-scroll.webp';
import hibikiUrl from '../../../../assets/card/ill-hibiki.webp';
import hirameUrl from '../../../../assets/card/ill-hirame.webp';
import kanameUrl from '../../../../assets/card/ill-kaname.webp';
import minoriUrl from '../../../../assets/card/ill-minori.webp';
import musubiUrl from '../../../../assets/card/ill-musubi.webp';
import sasaeUrl from '../../../../assets/card/ill-sasae.webp';
import takumiUrl from '../../../../assets/card/ill-takumi.webp';
import yukihiroUrl from '../../../../assets/card/ill-yukihiro.webp';
import type { MemberId } from '../guild.config';
import type { QuestCardOwner } from './questCard';

/**
 * The pictures of the quest card (Issue #269): codex-made frames, back and one picture per member
 * (assets/card, bundled by Vite: nothing from another origin). Which ones a card uses is decided
 * here; the card only lays them out.
 */

/** A part of the frame, in % of the card (the frames are 600 x 840). */
export interface CardBox {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface CardFrame {
  /** The frame's picture: the department's grey metal, or the king's gold. */
  readonly image: string;
  /** The parchment scroll laid over the metal, kept out of the tint; null when `image` has it. */
  readonly scroll: string | null;
  /** True when the metal takes the member's colour (the department frame). */
  readonly tinted: boolean;
  /** The picture's window, the cost's ring, the title band and the scroll's writing area. */
  readonly window: CardBox;
  readonly cost: CardBox;
  readonly band: CardBox;
  readonly text: CardBox;
}

/** Pixels of the 600 x 840 frame to % of it. */
function box(x: number, y: number, w: number, h: number): CardBox {
  return {
    left: (x / 600) * 100,
    top: (y / 840) * 100,
    width: (w / 600) * 100,
    height: (h / 840) * 100,
  };
}

/** Measured on assets/card (2026-11-08). Redraw a frame, measure again. */
export const CARD_FRAMES = {
  department: {
    image: metalFrameUrl,
    scroll: scrollFrameUrl,
    tinted: true,
    window: box(53, 201, 494, 382),
    cost: box(65, 82, 92, 92),
    band: box(165, 78, 380, 88),
    text: box(95, 628, 410, 136),
  },
  crown: {
    image: crownFrameUrl,
    scroll: null,
    tinted: false,
    window: box(51, 208, 497, 411),
    cost: box(62, 103, 84, 84),
    band: box(152, 95, 393, 85),
    text: box(100, 660, 400, 120),
  },
} as const satisfies Record<string, CardFrame>;

export const CARD_BACK: string = backUrl;

export const CARD_PICTURES: Readonly<Record<MemberId, string>> = {
  kaname: kanameUrl,
  minori: minoriUrl,
  hibiki: hibikiUrl,
  hirame: hirameUrl,
  sasae: sasaeUrl,
  takumi: takumiUrl,
  musubi: musubiUrl,
  yukihiro: yukihiroUrl,
};

export interface CardArt {
  readonly frame: CardFrame;
  readonly picture: string;
}

/** The frame and the picture of a card: the crown for the king, the member in charge's picture. */
export function cardArtOf(owner: Pick<QuestCardOwner, 'id' | 'crown'>): CardArt {
  return {
    frame: owner.crown ? CARD_FRAMES.crown : CARD_FRAMES.department,
    picture: CARD_PICTURES[owner.id],
  };
}
