import type { MemberId } from '../guild.config';

/**
 * What the members say over their heads at the moments of a scene, and now and then when they
 * start waiting on someone (Issue #47, docs/DESIGN.md 4.12). Fixed lines only: no title, label or
 * branch name from a snapshot ever reaches a bubble,
 * and the types keep it so (a bubble takes a SpokenLine, a union of these literals). Hiragana and
 * katakana with a few signs, at most 7 characters (lines.test.ts checks every one); no names, so
 * renaming a member in guild.settings.json never puts a wrong name in someone's mouth. Nothing that
 * reads as a fact about the company (its accounts, its posts).
 *
 * The murmurs (murmurs.ts) at the play spots, dozing and asleep are the same for everyone
 * (SHARED_LINES), unless a member has lines of their own there (the king's sleep talk).
 */

/** The moments of a scene someone speaks at. */
export type LineScene =
  /** かなめ hands the scroll over beside the member's desk. */
  | 'handOver'
  /** かなめ lets the tossed scroll go. */
  | 'toss'
  /** The scroll is in their hands: a member at the desk, or かなめ alone at the reception. */
  | 'takeScroll'
  /** A member hands the chest over at the counter. */
  | 'deliverChest'
  /** かなめ holds the chest up: handed over, or alone at the reception. */
  | 'takeChest'
  /** Confetti over the member whose quest was cleared. */
  | 'clear'
  /** The king, after the member's line on a clear. */
  | 'seeClear'
  /** The king on the throne as he takes the scroll of his own quest (Issue #146). */
  | 'kingTakeScroll'
  /** The king on the throne when his own quest is cleared (Issue #147). */
  | 'kingClear'
  /** かなめ at the reception, after the king's line on his clear. */
  | 'seeKingClear'
  /** Now waiting for the president's approval (remarks.ts: now and then, at the seat). */
  | 'awaitPresident'
  /** Now waiting for かなめ's review; for かなめ, now with pull requests to review. */
  | 'awaitKaname'
  /** Now waiting for a permission in the session. */
  | 'awaitPermission'
  /** A murmur at the desk with work to do (murmurs.ts). */
  | 'work'
  /**
   * A murmur at the seat with nothing to do, awake; the king's, on the throne with nothing to
   * approve and none of his quests open (Issue #151).
   */
  | 'idle'
  /** The king's murmur on the throne with one or two of his quests open (Issue #151). */
  | 'kingWork'
  /** The king's murmur on the throne with his quests piling up (`LINES.kingPiledQuests` or more). */
  | 'kingWorkPiled'
  /** A murmur dozing at the seat. */
  | 'doze'
  /** Talking in their sleep at the seat. */
  | 'sleepTalk'
  /** A murmur at a play spot (idleSpots.ts): beside the mugs, beside the pet, with a neighbour. */
  | 'tea'
  | 'pet'
  | 'chat'
  /** A murmur under the window, by the part of the day (daylight.dayPhaseOf). */
  | 'windowMorning'
  | 'windowDay'
  | 'windowEvening'
  | 'windowNight';

/** At least one line for each moment a member has. */
type Choices = readonly [string, ...string[]];

export const LINE_BOOK = {
  kaname: {
    handOver: ['クエストです！', 'おねがいします', 'たのみますね', 'はい、どうぞ'],
    toss: ['それっ！', 'パスです！', 'うけとって！'],
    takeScroll: ['うけつけました', 'おあずかり！', 'きろく、よし'],
    takeChest: ['おつかれさま！', 'たしかに！', 'おみごとです', 'うけとりました'],
    clear: ['かんりょうです', 'やりましたね', 'クリアです！'],
    seeKingClear: ['さすがです', 'おみごと！', 'おつかれさま'],
    awaitKaname: ['かくにんします', 'みておきますね', 'チェックします'],
    awaitPermission: ['よろしいですか', 'ごかくにんを！', 'きょかを…'],
    work: ['てきぱきと！', 'じゅんばんに', 'ととのえて…', 'よし、つぎ'],
    idle: ['ひまですね', 'つぎはまだかな', 'うけつけ、ヨシ', 'のんびりです'],
  },
  minori: {
    takeScroll: ['うけたまわり！', 'けいさんします', 'はい、きっちり', 'おまかせを'],
    deliverChest: ['できました！', 'そろいました', 'ぴったりです'],
    clear: ['かんりょう！', 'すっきり！', 'やりました！'],
    awaitPresident: ['ごしょうにんを', 'はんこください', 'おねがいします'],
    awaitKaname: ['みてください', 'かくにんを…', 'どうでしょう？'],
    awaitPermission: ['よいですか？', 'きょか、まだ？', 'おうかがいを'],
    work: ['ぱちぱち…', 'あうかな…', 'よし、あった', 'きっちりと'],
    idle: ['ふう…', 'のんびり…', 'せいとん、よし'],
  },
  hibiki: {
    takeScroll: ['まかせて！', 'きたきた！', 'いくよー！', 'よっしゃ！'],
    deliverChest: ['できたよ！', 'とどけ〜！', 'じしんさく！', 'みてみて！'],
    clear: ['やったー！', 'さいこう！', 'イェーイ！'],
    awaitPresident: ['おうさま〜！', 'みてほしいな', 'しょうにん！'],
    awaitKaname: ['みてみて〜', 'どうかな？', 'おねがい！'],
    awaitPermission: ['いい？いい？', 'まだかな〜', 'ゴーサイン？'],
    work: ['いいかんじ！', 'ノッてきた！', 'よし、いける', 'ラララ♪'],
    idle: ['ひまだ〜', 'ふんふ〜ん♪', 'なにしよっか'],
  },
  hirame: {
    takeScroll: ['おもしろそう', 'かんがえます', 'ふむ、なるほど', 'いいですね'],
    deliverChest: ['かたちに！', 'できたかも！', 'あんです！', 'どうぞ…！'],
    clear: ['やった…！', 'よそうどおり', 'うまくいった', 'つぎは〜'],
    awaitPresident: ['おうさま、ぜひ', 'ごはんだんを', 'どうでしょう'],
    awaitKaname: ['みてもらお', 'どきどき…', 'いかがかな'],
    awaitPermission: ['いいのかな…', 'すすめても？', 'うーん、まつ'],
    work: ['うーん…', 'もしかして…', 'メモメモ', 'ピンときた！'],
    idle: ['ぼんやり…', 'ふと、おもう', 'くもみたい…'],
  },
  sasae: {
    takeScroll: ['まかせてね', 'しょうちです', 'やっておくね', 'はーい'],
    deliverChest: ['ととのえたよ', 'おまたせ', 'できました'],
    clear: ['ひとあんしん', 'よかったね', 'おつかれさま', 'ほっとした'],
    awaitPresident: ['ごさいけつを', 'おねがいね', 'みてくださいね'],
    awaitKaname: ['みておいてね', 'たしかめてね', 'おねがいします'],
    awaitPermission: ['いいかしら？', 'まってますね', 'どうかしら？'],
    work: ['せいり、せいり', 'こつこつと', 'ファイル、よし'],
    idle: ['おそうじ、よし', 'へいわだね', 'おちゃにする？'],
  },
  takumi: {
    takeScroll: ['うけおった', 'つくりますか', 'よし、やるか', 'まかせとけ'],
    deliverChest: ['しあがった', 'うごくはず', 'できたぞ'],
    clear: ['いっちょあがり', 'よし、とおった', 'かんせいだ'],
    awaitPresident: ['みてくだされ', 'はんだんを', 'たのみます'],
    awaitKaname: ['レビューを！', 'みてくれるか', 'かくにんを'],
    awaitPermission: ['いいですか？', 'うごかすぞ？', 'まだかな'],
    work: ['とんてんかん', 'ここをこうして', 'ねじ、よし', 'カチャカチャ'],
    idle: ['どうぐのていれ', 'ひとやすみ', 'ふむ…'],
  },
  musubi: {
    takeScroll: ['よろこんで！', 'おまかせを！', 'つなぎます！', 'いってきます'],
    deliverChest: ['まとまりました', 'ごえんです！', 'とどけます！'],
    clear: ['ごせいやく！', 'ありがたい！', 'ばんざい！'],
    awaitPresident: ['ごけつだんを！', 'いいおはなし', 'おねがいです'],
    awaitKaname: ['みてくれる？', 'どうかしら', 'おねがいね'],
    awaitPermission: ['よろしくて？', 'おまちします', 'いいかな？'],
    work: ['にこにこ', 'あいさつから', 'ごあいさつ♪', 'こうしょう…'],
    idle: ['おちゃのじかん', 'だれかくるかな', 'ふふっ'],
  },
  yukihiro: {
    seeClear: ['みごとじゃ！', 'あっぱれ！', 'ほめてつかわす'],
    kingTakeScroll: ['わしのしごと', 'やるかのう', 'ふむ、これか'],
    kingClear: ['おわったぞ！', 'やりとげた', 'どうじゃ！'],
    kingWork: ['よいしょ', 'かきかき', 'でんわせねば', 'ふむ…ふむ…'],
    kingWorkPiled: ['やまづみじゃ', 'ふう…', 'ひとつずつ'],
    idle: ['うむ', 'よきかな', 'へいわじゃのう', 'ふむふむ'],
    sleepTalk: ['むにゃ…', 'もうたべられぬ', 'うむ…うむ…'],
  },
} as const satisfies Readonly<Record<MemberId, Readonly<Partial<Record<LineScene, Choices>>>>>;

/** The murmurs anyone says at a play spot, dozing or asleep (murmurs.ts). */
export const SHARED_LINES = {
  tea: ['ほっ…', 'おいしい', 'ずずっ'],
  pet: ['かわいいね', 'よしよし', 'おすわり！'],
  chat: ['それでね…', 'へえ〜！', 'ほんとに？', 'わかる〜'],
  windowMorning: ['いいあさ', 'まぶしいな', 'あさだね〜'],
  windowDay: ['いいてんき', 'ことりだ', 'ぽかぽか'],
  windowEvening: ['ゆうやけだ', 'きれいだな', 'あかいそら'],
  windowNight: ['ほしがきれい', 'しずかだね', 'つきだ…'],
  doze: ['ねむ…', 'ふぁ〜', 'うと…うと…'],
  sleepTalk: ['むにゃ…', 'すぴー…', 'あとすこし…'],
} as const satisfies Readonly<Partial<Record<LineScene, Choices>>>;

type Book = typeof LINE_BOOK;
type LinesOf<M extends MemberId> = {
  [S in keyof Book[M]]: Book[M][S] extends readonly (infer L)[] ? L : never;
}[keyof Book[M]];
type Shared = typeof SHARED_LINES;
type SharedLine = { [S in keyof Shared]: Shared[S][number] }[keyof Shared];

/** Any line in the book: the only strings a member's line bubble takes. */
export type SpokenLine = { [M in MemberId]: LinesOf<M> }[MemberId] | SharedLine;

type Lines = Readonly<Partial<Record<LineScene, readonly SpokenLine[]>>>;

const BOOK: Readonly<Record<MemberId, Lines>> = LINE_BOOK;
const SHARED: Lines = SHARED_LINES;

const SCENES: readonly LineScene[] = [
  'handOver',
  'toss',
  'takeScroll',
  'deliverChest',
  'takeChest',
  'clear',
  'seeClear',
  'kingTakeScroll',
  'kingClear',
  'seeKingClear',
  'awaitPresident',
  'awaitKaname',
  'awaitPermission',
  'work',
  'idle',
  'kingWork',
  'kingWorkPiled',
  'doze',
  'sleepTalk',
  'tea',
  'pet',
  'chat',
  'windowMorning',
  'windowDay',
  'windowEvening',
  'windowNight',
];

/** The moment a member says `line` at (a member never has one line at two moments: lineBook.test.ts). */
export function sceneOfLine(id: MemberId, line: SpokenLine): LineScene | null {
  return SCENES.find((scene) => linesOf(id, scene).includes(line)) ?? null;
}

/** True when `id` has lines of their own at `scene`, not the shared ones (SHARED_LINES). */
export function hasOwnLines(id: MemberId, scene: LineScene): boolean {
  return BOOK[id][scene] !== undefined;
}

/**
 * The lines a member may say at a moment: their own, else the shared ones; none when they say
 * nothing there.
 */
export function linesOf(id: MemberId, scene: LineScene): readonly SpokenLine[] {
  return BOOK[id][scene] ?? SHARED[scene] ?? [];
}
